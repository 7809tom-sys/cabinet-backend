import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import {
  cabinetConfigChangeLog,
  cabinetRecoverySnapshots,
  cabinets,
  distributorCabinetOverrides,
  distributors,
  mediaImages,
} from "../../drizzle/schema";
import { logCabinetConfigChanges, parseLoggedValue, type ConfigChangeActor } from "./cabinetConfigHistory";
import { parseDistributorCabinetConfig } from "./distributorCabinetConfig";

type Db = NonNullable<Awaited<ReturnType<typeof import("../db").getDb>>>;

/** Columns that are never restored from a snapshot or a log entry (identity / bookkeeping). */
const PROTECTED_FIELDS = new Set(["id", "masterCode", "createdAt", "configuredAt", "configVerifiedAt", "conflictedAt", "priceVerifiedAt"]);
/** Timestamp columns that must be revived as Date when a snapshot is applied. */
const DATE_FIELDS = new Set(["conflictedAt", "priceVerifiedAt", "configuredAt", "configVerifiedAt", "createdAt"]);

const DAY_MS = 24 * 60 * 60 * 1000;

export type CabinetRow = typeof cabinets.$inferSelect;

/**
 * Store a full copy of the master row plus every distributor rule for a cabinet.
 * Called before every logged admin edit and on demand from Data Recovery.
 */
export async function snapshotCabinet(
  db: Db,
  args: { cabinetId: number; reason: string; actor: ConfigChangeActor },
): Promise<number | null> {
  const [row] = await db.select().from(cabinets).where(eq(cabinets.id, args.cabinetId)).limit(1);
  if (!row) return null;
  const overrides = await db
    .select()
    .from(distributorCabinetOverrides)
    .where(eq(distributorCabinetOverrides.cabinetId, args.cabinetId));
  const [inserted] = await db.insert(cabinetRecoverySnapshots).values({
    cabinetId: row.id,
    masterCode: row.masterCode ?? "",
    reason: args.reason,
    rowJson: JSON.stringify(row),
    overridesJson: JSON.stringify(overrides),
    takenBy: args.actor.id ?? null,
    takenByName: args.actor.name ?? null,
  });
  return Number((inserted as { insertId?: number }).insertId ?? 0) || null;
}

/** Snapshots for one cabinet (newest first). */
export async function snapshotsForCabinet(db: Db, cabinetId: number, limit = 50) {
  const rows = await db
    .select()
    .from(cabinetRecoverySnapshots)
    .where(eq(cabinetRecoverySnapshots.cabinetId, cabinetId))
    .orderBy(desc(cabinetRecoverySnapshots.createdAt), desc(cabinetRecoverySnapshots.id))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    cabinetId: r.cabinetId,
    masterCode: r.masterCode,
    reason: r.reason,
    takenByName: r.takenByName,
    createdAt: r.createdAt,
    row: safeParse(r.rowJson) as Record<string, unknown> | null,
    overrides: (safeParse(r.overridesJson) as Record<string, unknown>[] | null) ?? [],
  }));
}

function safeParse(json: string | null): unknown {
  if (json == null) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** Fields of a snapshot that differ from the live row (what a restore would change). */
export function diffSnapshotAgainstRow(snapshot: Record<string, unknown>, live: Record<string, unknown>) {
  const out: { field: string; snapshotValue: unknown; liveValue: unknown }[] = [];
  for (const field of Object.keys(snapshot)) {
    if (PROTECTED_FIELDS.has(field)) continue;
    const a = norm(snapshot[field]);
    const b = norm(live[field]);
    if (a !== b) out.push({ field, snapshotValue: snapshot[field], liveValue: live[field] });
  }
  return out;
}

const norm = (v: unknown): string => {
  if (v === undefined || v === null || v === "") return "null";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "number") return String(v);
  if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v)) return String(Number(v));
  return JSON.stringify(v);
};

/**
 * Restore a master row from a snapshot. Only fields in `fields` (or every
 * differing non-protected field) are written. A "before-restore" snapshot is
 * taken first so the restore itself can be undone, and every field change is
 * written to the config change log.
 */
export async function restoreCabinetFromSnapshot(
  db: Db,
  args: { snapshotId: number; fields?: string[]; restoreOverrides?: boolean; actor: ConfigChangeActor },
) {
  const [snap] = await db.select().from(cabinetRecoverySnapshots).where(eq(cabinetRecoverySnapshots.id, args.snapshotId)).limit(1);
  if (!snap) throw new Error("Snapshot not found");
  const snapshotRow = safeParse(snap.rowJson) as Record<string, unknown> | null;
  if (!snapshotRow) throw new Error("Snapshot is unreadable");
  const [live] = await db.select().from(cabinets).where(eq(cabinets.id, snap.cabinetId)).limit(1);
  if (!live) throw new Error("Cabinet no longer exists");

  await snapshotCabinet(db, { cabinetId: snap.cabinetId, reason: "before-restore", actor: args.actor });

  const diffs = diffSnapshotAgainstRow(snapshotRow, live as unknown as Record<string, unknown>);
  const wanted = args.fields?.length ? new Set(args.fields) : null;
  const patch: Record<string, unknown> = {};
  for (const d of diffs) {
    if (wanted && !wanted.has(d.field)) continue;
    if (!(d.field in cabinets)) continue;
    let v = d.snapshotValue;
    if (DATE_FIELDS.has(d.field) && typeof v === "string") v = new Date(v);
    patch[d.field] = v;
  }
  let restoredFields = 0;
  if (Object.keys(patch).length > 0) {
    await db
      .update(cabinets)
      .set({ ...(patch as Partial<typeof cabinets.$inferInsert>), configuredAt: new Date() })
      .where(eq(cabinets.id, snap.cabinetId));
    restoredFields = await logCabinetConfigChanges(db, {
      cabinetId: snap.cabinetId,
      masterCode: live.masterCode ?? "",
      scope: "master",
      before: live as unknown as Record<string, unknown>,
      after: patch,
      actor: args.actor,
    });
  }

  let restoredOverrides = 0;
  if (args.restoreOverrides) {
    const overrides = (safeParse(snap.overridesJson) as Record<string, unknown>[] | null) ?? [];
    for (const o of overrides) {
      const distributorId = Number(o.distributorId);
      if (!distributorId) continue;
      const [current] = await db
        .select()
        .from(distributorCabinetOverrides)
        .where(and(eq(distributorCabinetOverrides.cabinetId, snap.cabinetId), eq(distributorCabinetOverrides.distributorId, distributorId)))
        .limit(1);
      const values = {
        width: (o.width as string | null) ?? null,
        height: (o.height as string | null) ?? null,
        depth: (o.depth as string | null) ?? null,
        physicalWidth: (o.physicalWidth as string | null) ?? null,
        weight: (o.weight as string | null) ?? null,
        pkgLength: (o.pkgLength as string | null) ?? null,
        pkgWidth: (o.pkgWidth as string | null) ?? null,
        pkgHeight: (o.pkgHeight as string | null) ?? null,
        pkgWeight: (o.pkgWeight as string | null) ?? null,
        imageUrl: (o.imageUrl as string | null) ?? null,
        note: (o.note as string | null) ?? null,
        configJson: (o.configJson as string | null) ?? null,
        updatedBy: args.actor.id ?? null,
      } as Partial<typeof distributorCabinetOverrides.$inferInsert>;
      if (current) {
        await db.update(distributorCabinetOverrides).set(values).where(eq(distributorCabinetOverrides.id, current.id));
      } else {
        await db.insert(distributorCabinetOverrides).values({ cabinetId: snap.cabinetId, distributorId, ...values });
      }
      await logCabinetConfigChanges(db, {
        cabinetId: snap.cabinetId,
        masterCode: live.masterCode ?? "",
        scope: "distributor",
        distributorId,
        before: parseDistributorCabinetConfig(current?.configJson) as Record<string, unknown>,
        after: parseDistributorCabinetConfig(values.configJson ?? null) as Record<string, unknown>,
        actor: args.actor,
      });
      restoredOverrides++;
    }
  }
  return { cabinetId: snap.cabinetId, masterCode: live.masterCode, restoredFields, restoredOverrides };
}

// ─── Recovery scan ────────────────────────────────────────────────────────────

export interface RecoveryImageCandidate {
  mediaId: number;
  label: string;
  url: string;
  uploadedAt: Date;
  isCurrent: boolean;
}

export interface RecoveryCabinet {
  cabinetId: number;
  masterCode: string;
  description: string | null;
  category: string | null;
  catalogImageUrl: string | null;
  configuredAt: Date | null;
  /** Newest activity across all traces. */
  lastActivityAt: Date | null;
  loggedChanges: number;
  revertedChanges: number;
  distributorRules: { distributorId: number; distributorName: string | null; fields: string[]; updatedAt: Date | null }[];
  snapshots: number;
  /** Media-library uploads whose label starts with this cabinet's code. */
  imageCandidates: RecoveryImageCandidate[];
  /** Why this cabinet was flagged. */
  signals: string[];
  /** True when nothing but a timestamp survived (details cannot be reconstructed). */
  detailsLost: boolean;
}

const codeKey = (s: string) => s.toUpperCase().replace(/[\s_-]+/g, "");

/**
 * Gather every trace of recent cabinet editing that exists in the database and
 * group it per cabinet so an admin can see what is recoverable:
 *  - field-level change log (revertable),
 *  - distributor rules (restorable/removable),
 *  - recovery snapshots (restorable),
 *  - media-library uploads named after the cabinet that were never attached,
 *  - cabinets stamped configuredAt with no surviving detail (flagged as lost).
 */
export async function scanRecoverableCabinets(db: Db, opts: { days?: number; cabinetId?: number } = {}) {
  const days = opts.days ?? 7;
  const since = new Date(Date.now() - days * DAY_MS);

  const distRows = await db.select({ id: distributors.id, name: distributors.name }).from(distributors);
  const distName = new Map(distRows.map((d) => [d.id, d.name]));

  const logRows = await db
    .select({
      cabinetId: cabinetConfigChangeLog.cabinetId,
      n: sql<number>`count(*)`,
      reverted: sql<number>`sum(case when ${cabinetConfigChangeLog.revertedAt} is null then 0 else 1 end)`,
      last: sql<Date>`max(${cabinetConfigChangeLog.createdAt})`,
    })
    .from(cabinetConfigChangeLog)
    .where(opts.cabinetId ? and(gte(cabinetConfigChangeLog.createdAt, since), eq(cabinetConfigChangeLog.cabinetId, opts.cabinetId)) : gte(cabinetConfigChangeLog.createdAt, since))
    .groupBy(cabinetConfigChangeLog.cabinetId);

  const overrideRows = await db
    .select()
    .from(distributorCabinetOverrides)
    .where(opts.cabinetId ? and(gte(distributorCabinetOverrides.updatedAt, since), eq(distributorCabinetOverrides.cabinetId, opts.cabinetId)) : gte(distributorCabinetOverrides.updatedAt, since));

  const snapRows = await db
    .select({ cabinetId: cabinetRecoverySnapshots.cabinetId, n: sql<number>`count(*)`, last: sql<Date>`max(${cabinetRecoverySnapshots.createdAt})` })
    .from(cabinetRecoverySnapshots)
    .where(opts.cabinetId ? eq(cabinetRecoverySnapshots.cabinetId, opts.cabinetId) : gte(cabinetRecoverySnapshots.createdAt, since))
    .groupBy(cabinetRecoverySnapshots.cabinetId);

  const configuredRows = await db
    .select({ id: cabinets.id })
    .from(cabinets)
    .where(opts.cabinetId ? and(gte(cabinets.configuredAt, since), eq(cabinets.id, opts.cabinetId)) : gte(cabinets.configuredAt, since));

  const media = await db
    .select({ id: mediaImages.id, label: mediaImages.label, url: mediaImages.url, createdAt: mediaImages.createdAt })
    .from(mediaImages)
    .where(gte(mediaImages.createdAt, since))
    .orderBy(desc(mediaImages.createdAt));

  const ids = new Set<number>();
  for (const r of logRows) ids.add(r.cabinetId);
  for (const r of overrideRows) ids.add(r.cabinetId);
  for (const r of snapRows) ids.add(r.cabinetId);
  for (const r of configuredRows) ids.add(r.id);

  // Media labels can only be matched once we know cabinet codes, so load the
  // whole code list (683 rows) and match labels by prefix.
  const allCabinets = await db
    .select({ id: cabinets.id, masterCode: cabinets.masterCode, description: cabinets.description, category: cabinets.category, catalogImageUrl: cabinets.catalogImageUrl, configuredAt: cabinets.configuredAt })
    .from(cabinets);
  const byId = new Map(allCabinets.map((c) => [c.id, c]));
  const byKey = allCabinets
    .filter((c) => c.masterCode)
    .map((c) => ({ key: codeKey(c.masterCode!), c }))
    .sort((a, b) => b.key.length - a.key.length); // longest code first so "B24FH" does not match "B2"
  const imagesByCabinet = new Map<number, RecoveryImageCandidate[]>();
  for (const m of media) {
    const lk = codeKey(m.label);
    // Exact code, or code followed by a size / suffix token (e.g. "B24FH B36FH" → B24).
    const hit = byKey.find(({ key }) => key.length >= 2 && (lk === key || lk.startsWith(key)));
    if (!hit) continue;
    if (opts.cabinetId && hit.c.id !== opts.cabinetId) continue;
    const list = imagesByCabinet.get(hit.c.id) ?? [];
    list.push({ mediaId: m.id, label: m.label, url: m.url, uploadedAt: m.createdAt, isCurrent: hit.c.catalogImageUrl === m.url });
    imagesByCabinet.set(hit.c.id, list);
    ids.add(hit.c.id);
  }

  const logBy = new Map(logRows.map((r) => [r.cabinetId, r]));
  const snapBy = new Map(snapRows.map((r) => [r.cabinetId, r]));
  const ovBy = new Map<number, typeof overrideRows>();
  for (const o of overrideRows) ovBy.set(o.cabinetId, [...(ovBy.get(o.cabinetId) ?? []), o]);

  const out: RecoveryCabinet[] = [];
  for (const id of Array.from(ids)) {
    const c = byId.get(id);
    if (!c) continue;
    const log = logBy.get(id);
    const snap = snapBy.get(id);
    const ovs = ovBy.get(id) ?? [];
    const imgs = imagesByCabinet.get(id) ?? [];
    const signals: string[] = [];
    const times: number[] = [];
    if (log) { signals.push(`${Number(log.n)} logged field change${Number(log.n) === 1 ? "" : "s"}`); times.push(new Date(log.last).getTime()); }
    if (ovs.length) { signals.push(`${ovs.length} distributor rule${ovs.length === 1 ? "" : "s"} saved`); for (const o of ovs) if (o.updatedAt) times.push(new Date(o.updatedAt).getTime()); }
    if (snap) { signals.push(`${Number(snap.n)} snapshot${Number(snap.n) === 1 ? "" : "s"}`); times.push(new Date(snap.last).getTime()); }
    const unattached = imgs.filter((i) => !i.isCurrent);
    if (unattached.length) { signals.push(`${unattached.length} uploaded image${unattached.length === 1 ? "" : "s"} not attached`); for (const i of unattached) times.push(new Date(i.uploadedAt).getTime()); }
    if (c.configuredAt && new Date(c.configuredAt).getTime() >= since.getTime()) { times.push(new Date(c.configuredAt).getTime()); if (!log) signals.push("saved (details not recorded)"); }
    const detailsLost = !log && !snap && ovs.length === 0 && unattached.length === 0;
    out.push({
      cabinetId: id,
      masterCode: c.masterCode ?? "",
      description: c.description,
      category: c.category,
      catalogImageUrl: c.catalogImageUrl,
      configuredAt: c.configuredAt,
      lastActivityAt: times.length ? new Date(Math.max(...times)) : null,
      loggedChanges: Number(log?.n ?? 0),
      revertedChanges: Number(log?.reverted ?? 0),
      distributorRules: ovs.map((o) => ({
        distributorId: o.distributorId,
        distributorName: distName.get(o.distributorId) ?? null,
        fields: Object.keys(parseDistributorCabinetConfig(o.configJson) as Record<string, unknown>),
        updatedAt: o.updatedAt,
      })),
      snapshots: Number(snap?.n ?? 0),
      imageCandidates: imgs,
      signals,
      detailsLost,
    });
  }
  out.sort((a, b) => (b.lastActivityAt?.getTime() ?? 0) - (a.lastActivityAt?.getTime() ?? 0));
  return {
    days,
    since,
    cabinets: out,
    totals: {
      cabinets: out.length,
      withLoggedChanges: out.filter((c) => c.loggedChanges > 0).length,
      withDistributorRules: out.filter((c) => c.distributorRules.length > 0).length,
      withSnapshots: out.filter((c) => c.snapshots > 0).length,
      withUnattachedImages: out.filter((c) => c.imageCandidates.some((i) => !i.isCurrent)).length,
      detailsLost: out.filter((c) => c.detailsLost).length,
    },
  };
}

/** Attach a media-library upload as the cabinet's catalog image (snapshot + log). */
export async function restoreCabinetImage(db: Db, args: { cabinetId: number; url: string; actor: ConfigChangeActor }) {
  const [live] = await db.select().from(cabinets).where(eq(cabinets.id, args.cabinetId)).limit(1);
  if (!live) throw new Error("Cabinet not found");
  await snapshotCabinet(db, { cabinetId: args.cabinetId, reason: "before-restore", actor: args.actor });
  await db.update(cabinets).set({ catalogImageUrl: args.url, configuredAt: new Date() }).where(eq(cabinets.id, args.cabinetId));
  await logCabinetConfigChanges(db, {
    cabinetId: args.cabinetId,
    masterCode: live.masterCode ?? "",
    scope: "master",
    before: { catalogImageUrl: live.catalogImageUrl },
    after: { catalogImageUrl: args.url },
    actor: args.actor,
  });
  return { ok: true, previous: live.catalogImageUrl, current: args.url };
}

/** All un-reverted logged changes for one cabinet (any age) so "restore all" can replay them. */
export async function loggedChangesForCabinet(db: Db, cabinetId: number, days = 30) {
  const since = new Date(Date.now() - days * DAY_MS);
  const rows = await db
    .select()
    .from(cabinetConfigChangeLog)
    .where(and(eq(cabinetConfigChangeLog.cabinetId, cabinetId), gte(cabinetConfigChangeLog.createdAt, since), isNull(cabinetConfigChangeLog.revertedAt)))
    .orderBy(desc(cabinetConfigChangeLog.createdAt));
  return rows.map((r) => ({
    id: r.id,
    scope: r.scope,
    distributorId: r.distributorId,
    field: r.field,
    oldValue: parseLoggedValue(r.oldValueJson),
    newValue: parseLoggedValue(r.newValueJson),
    changedByName: r.changedByName,
    createdAt: r.createdAt,
  }));
}

/**
 * Re-apply the newest logged value of each master field for a cabinet. Used
 * when a cabinet was overwritten (e.g. by an import or a bulk tool) after an
 * admin edit: the edit's value is still in the log even if the row lost it.
 */
export async function reapplyLoggedEdits(db: Db, args: { cabinetId: number; days?: number; actor: ConfigChangeActor }) {
  const changes = await loggedChangesForCabinet(db, args.cabinetId, args.days ?? 30);
  const [live] = await db.select().from(cabinets).where(eq(cabinets.id, args.cabinetId)).limit(1);
  if (!live) throw new Error("Cabinet not found");
  const liveRec = live as unknown as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const ch of changes) {
    if (ch.scope !== "master" || ch.field in patch || PROTECTED_FIELDS.has(ch.field) || !(ch.field in cabinets)) continue;
    if (norm(liveRec[ch.field]) === norm(ch.newValue)) continue;
    patch[ch.field] = DATE_FIELDS.has(ch.field) && typeof ch.newValue === "string" ? new Date(ch.newValue) : ch.newValue;
  }
  if (Object.keys(patch).length === 0) return { cabinetId: args.cabinetId, reapplied: 0, fields: [] as string[] };
  await snapshotCabinet(db, { cabinetId: args.cabinetId, reason: "before-restore", actor: args.actor });
  await db
    .update(cabinets)
    .set({ ...(patch as Partial<typeof cabinets.$inferInsert>), configuredAt: new Date() })
    .where(eq(cabinets.id, args.cabinetId));
  await logCabinetConfigChanges(db, { cabinetId: args.cabinetId, masterCode: live.masterCode ?? "", scope: "master", before: liveRec, after: patch, actor: args.actor });
  return { cabinetId: args.cabinetId, reapplied: Object.keys(patch).length, fields: Object.keys(patch) };
}

/** Take a manual snapshot of many cabinets at once (e.g. "protect everything edited this week"). */
export async function snapshotMany(db: Db, args: { cabinetIds: number[]; actor: ConfigChangeActor; reason?: string }) {
  let n = 0;
  const unique = Array.from(new Set(args.cabinetIds));
  if (unique.length === 0) return { snapshots: 0 };
  const existing = await db.select({ id: cabinets.id }).from(cabinets).where(inArray(cabinets.id, unique));
  for (const { id } of existing) {
    if (await snapshotCabinet(db, { cabinetId: id, reason: args.reason ?? "manual", actor: args.actor })) n++;
  }
  return { snapshots: n };
}
