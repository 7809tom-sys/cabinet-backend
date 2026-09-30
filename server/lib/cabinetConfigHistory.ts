import { and, desc, eq, gte, isNull } from "drizzle-orm";
import { cabinetConfigChangeLog, cabinetRecoverySnapshots, cabinets, distributorCabinetOverrides, distributors } from "../../drizzle/schema";

/** Number of days a configuration change stays revertable from the history panel. */
export const CONFIG_REVERT_WINDOW_DAYS = 5;

type Db = NonNullable<Awaited<ReturnType<typeof import("../db").getDb>>>;

export type ConfigChangeScope = "master" | "distributor";

export interface ConfigChangeActor {
  id?: number | null;
  name?: string | null;
}

const encode = (v: unknown): string | null => (v === undefined ? null : JSON.stringify(v === undefined ? null : v));

const normalize = (v: unknown): unknown => {
  if (v === undefined || v === null || v === "") return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v;
  return String(v);
};

/**
 * Compare `before` and `after` for the given keys and insert one log row per
 * key whose value actually changed. Returns the number of rows written.
 * Values are compared after light normalization (numbers/decimals as strings,
 * empty string == null) so that a resave with no real edit writes nothing.
 */
/** Timestamps and audit columns that change on every save are not configuration. */
const BOOKKEEPING_FIELDS = new Set(["configVerifiedAt", "configVerifiedBy", "updatedAt", "updatedBy", "createdAt"]);

export async function logCabinetConfigChanges(
  db: Db,
  args: {
    cabinetId: number;
    masterCode: string;
    scope: ConfigChangeScope;
    distributorId?: number | null;
    before: Record<string, unknown>;
    after: Record<string, unknown>;
    keys?: string[];
    actor: ConfigChangeActor;
  },
): Promise<number> {
  const keys = args.keys ?? Object.keys(args.after);
  const rows: (typeof cabinetConfigChangeLog.$inferInsert)[] = [];
  for (const field of keys) {
    if (!(field in args.after)) continue;
    if (BOOKKEEPING_FIELDS.has(field)) continue;
    const oldV = normalize(args.before[field]);
    const newV = normalize(args.after[field]);
    if (JSON.stringify(oldV) === JSON.stringify(newV)) continue;
    rows.push({
      cabinetId: args.cabinetId,
      masterCode: args.masterCode,
      scope: args.scope,
      distributorId: args.scope === "distributor" ? (args.distributorId ?? null) : null,
      field,
      oldValueJson: encode(args.before[field] === undefined ? null : args.before[field]),
      newValueJson: encode(args.after[field]),
      changedBy: args.actor.id ?? null,
      changedByName: args.actor.name ?? null,
    });
  }
  if (rows.length > 0) await db.insert(cabinetConfigChangeLog).values(rows);
  return rows.length;
}

export function parseLoggedValue(json: string | null): unknown {
  if (json == null) return null;
  try {
    return JSON.parse(json);
  } catch {
    return json;
  }
}

/** Recent configuration changes (newest first) within the revert window, optionally for one cabinet. */
export async function recentCabinetConfigChanges(
  db: Db,
  opts: { cabinetId?: number; days?: number; limit?: number; includeReverted?: boolean } = {},
) {
  const days = opts.days ?? CONFIG_REVERT_WINDOW_DAYS;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const conds = [gte(cabinetConfigChangeLog.createdAt, since)];
  if (opts.cabinetId) conds.push(eq(cabinetConfigChangeLog.cabinetId, opts.cabinetId));
  if (!opts.includeReverted) conds.push(isNull(cabinetConfigChangeLog.revertedAt));
  const rows = await db
    .select({
      row: cabinetConfigChangeLog,
      distributorName: distributors.name,
    })
    .from(cabinetConfigChangeLog)
    .leftJoin(distributors, eq(distributors.id, cabinetConfigChangeLog.distributorId))
    .where(and(...conds))
    .orderBy(desc(cabinetConfigChangeLog.createdAt), desc(cabinetConfigChangeLog.id))
    .limit(opts.limit ?? 2000);
  const cutoff = Date.now() - CONFIG_REVERT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return rows.map(({ row, distributorName }) => ({
    id: row.id,
    cabinetId: row.cabinetId,
    masterCode: row.masterCode,
    scope: row.scope,
    distributorId: row.distributorId,
    distributorName,
    field: row.field,
    oldValue: parseLoggedValue(row.oldValueJson),
    newValue: parseLoggedValue(row.newValueJson),
    changedBy: row.changedBy,
    changedByName: row.changedByName,
    createdAt: row.createdAt,
    revertedAt: row.revertedAt,
    canRevert: row.revertedAt == null && new Date(row.createdAt).getTime() >= cutoff,
  }));
}

/**
 * Update one master cabinet row from any admin edit surface, stamp
 * configuredAt (so it counts as a recent save) and log the field-level diff.
 * Every admin path that edits a cabinet should go through here so the
 * Cabinet Config history is complete, not only the Cabinet Config editor.
 */
/**
 * Store a full copy of the master row (and its distributor rules) so the
 * cabinet can be restored from Admin → Data Recovery. Lives here (not in
 * cabinetRecovery.ts) so every logged edit can call it without a cycle.
 */
export async function snapshotCabinetBeforeEdit(
  db: Db,
  args: { cabinetId: number; reason: string; actor: ConfigChangeActor },
): Promise<void> {
  const [row] = await db.select().from(cabinets).where(eq(cabinets.id, args.cabinetId)).limit(1);
  if (!row) return;
  const overrides = await db
    .select()
    .from(distributorCabinetOverrides)
    .where(eq(distributorCabinetOverrides.cabinetId, args.cabinetId));
  await db.insert(cabinetRecoverySnapshots).values({
    cabinetId: row.id,
    masterCode: row.masterCode ?? "",
    reason: args.reason,
    rowJson: JSON.stringify(row),
    overridesJson: JSON.stringify(overrides),
    takenBy: args.actor.id ?? null,
    takenByName: args.actor.name ?? null,
  });
}

export async function updateCabinetLogged(
  db: Db,
  args: { cabinetId: number; patch: Record<string, unknown>; actor: ConfigChangeActor },
): Promise<{ logged: number }> {
  const [before] = await db.select().from(cabinets).where(eq(cabinets.id, args.cabinetId)).limit(1);
  if (!before) return { logged: 0 };
  await snapshotCabinetBeforeEdit(db, { cabinetId: args.cabinetId, reason: "before-edit", actor: args.actor });
  await db
    .update(cabinets)
    .set({ ...(args.patch as Partial<typeof cabinets.$inferInsert>), configuredAt: new Date() })
    .where(eq(cabinets.id, args.cabinetId));
  const logged = await logCabinetConfigChanges(db, {
    cabinetId: args.cabinetId,
    masterCode: before.masterCode ?? "",
    scope: "master",
    before: before as unknown as Record<string, unknown>,
    after: args.patch,
    actor: args.actor,
  });
  return { logged };
}
