import { getDb } from "../server/db";
import { eq } from "drizzle-orm";
import { cabinets, cabinetAliases, skuMasterAliases, cabinetCodeEquivalences, distributorSkus } from "../drizzle/schema";

const norm = (v: unknown) => String(v ?? "").trim().toUpperCase().replace(/[- _]/g, "");
const clean = (v: unknown) => String(v ?? "").trim();

async function main() {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL is not available");
  const [cabinetRows, cabinetAliasRows, skuAliasRows, equivalenceRows, supplierRows] = await Promise.all([
    db.select().from(cabinets),
    db.select().from(cabinetAliases),
    db.select().from(skuMasterAliases),
    db.select().from(cabinetCodeEquivalences),
    db.select({ cabinetId: distributorSkus.cabinetId }).from(distributorSkus),
  ]);

  type Row = typeof cabinetRows[number];
  const parent = new Map<string, string>();
  const variants = new Map<string, Set<string>>();
  const addNode = (value: unknown) => {
    const code = clean(value); if (!code) return "";
    const key = norm(code);
    if (!parent.has(key)) parent.set(key, key);
    if (!variants.has(key)) variants.set(key, new Set());
    variants.get(key)!.add(code);
    return key;
  };
  const find = (x: string): string => {
    let p = parent.get(x) ?? x;
    while (parent.get(p) && parent.get(p) !== p) p = parent.get(p)!;
    parent.set(x, p); return p;
  };
  const union = (a: unknown, b: unknown) => {
    const ak = addNode(a), bk = addNode(b); if (!ak || !bk) return;
    const ar = find(ak), br = find(bk); if (ar !== br) parent.set(br, ar);
  };
  for (const row of cabinetRows) addNode(row.masterCode);
  for (const row of skuAliasRows) union(row.aliasCode, row.masterCode);
  for (const row of cabinetAliasRows) {
    const target = cabinetRows.find((c) => c.id === row.cabinetId);
    union(row.alias, target?.masterCode ?? "");
  }
  for (const row of equivalenceRows) if (row.isActive) union(row.codeA, row.codeB);

  const rowByNorm = new Map<string, Row>();
  for (const row of cabinetRows) rowByNorm.set(norm(row.masterCode), row);
  const rootOf = (code: unknown) => find(norm(code));
  const rowsByRoot = new Map<string, Row[]>();
  for (const row of cabinetRows) {
    const root = rootOf(row.masterCode);
    const list = rowsByRoot.get(root) ?? []; list.push(row); rowsByRoot.set(root, list);
  }
  const codeVariantsByRoot = new Map<string, Set<string>>();
  for (const [key, codes] of variants) {
    const root = find(key); const set = codeVariantsByRoot.get(root) ?? new Set<string>();
    for (const code of codes) set.add(code); codeVariantsByRoot.set(root, set);
  }
  const inbound = new Map<string, number>(), outbound = new Map<string, number>();
  for (const row of skuAliasRows) {
    if (row.conflictStatus !== "ok") continue;
    const a = norm(row.aliasCode), m = norm(row.masterCode);
    inbound.set(m, (inbound.get(m) ?? 0) + 1);
    outbound.set(a, (outbound.get(a) ?? 0) + 1);
  }
  for (const row of cabinetAliasRows) {
    const target = cabinetRows.find((c) => c.id === row.cabinetId);
    if (!target) continue;
    const a = norm(row.alias), m = norm(target.masterCode);
    outbound.set(a, (outbound.get(a) ?? 0) + 1);
    inbound.set(m, (inbound.get(m) ?? 0) + 1);
  }
  const supplierCount = new Map<number, number>();
  for (const row of supplierRows) if (row.cabinetId != null) supplierCount.set(row.cabinetId, (supplierCount.get(row.cabinetId) ?? 0) + 1);

  const score = (row: Row) => {
    const rowCodes = [...(codeVariantsByRoot.get(rootOf(row.masterCode)) ?? new Set([row.masterCode]))].filter((code) => rowByNorm.get(norm(code))?.id === row.id || !rowByNorm.has(norm(code)));
    const links = rowCodes.reduce((n, code) => n + (inbound.get(norm(code)) ?? 0) + (outbound.get(norm(code)) ?? 0), 0);
    const inboundLinks = rowCodes.reduce((n, code) => n + (inbound.get(norm(code)) ?? 0), 0);
    return { row, links, inboundLinks, suppliers: supplierCount.get(row.id) ?? 0, active: row.isActive ? 1 : 0, visible: row.showInCatalog || row.showInDesigner ? 1 : 0 };
  };

  const decisions: Array<{ root: string; masterId: number; masterCode: string; promoted: boolean; aliases: string[]; sourceRows: number[] }> = [];
  for (const [root, rows] of rowsByRoot) {
    const ranked = rows.map(score).sort((a, b) => b.links - a.links || b.suppliers - a.suppliers || b.active - a.active || b.visible - a.visible || b.inboundLinks - a.inboundLinks || a.row.masterCode.localeCompare(b.row.masterCode));
    const master = ranked[0];
    if (!master) continue;
    const aliases = [...(codeVariantsByRoot.get(root) ?? new Set())].filter((code) => norm(code) !== norm(master.row.masterCode));
    decisions.push({ root, masterId: master.row.id, masterCode: master.row.masterCode, promoted: !master.row.isActive, aliases, sourceRows: rows.filter((r) => r.id !== master.row.id).map((r) => r.id) });
  }

  const baRow = cabinetRows.find((r) => r.masterCode === "BEC24");
  const baAliasRows = skuAliasRows.filter((r) => ["BEC-24", "BEC24"].includes(r.aliasCode));
  const baDecision = decisions.find((d) => d.masterId === baRow?.id);
  if (baDecision && baRow) {
    baDecision.masterCode = "BA-24";
    baDecision.aliases = Array.from(new Set([...baDecision.aliases, "BEC-24", "BEC24"]));
  }
  await db.transaction(async (tx) => {
    // Resolve the explicit BA-24 missing-master conflict by naming the existing
    // physical row BA-24 and retaining both old codes as aliases.
    if (baRow && !(cabinetRows.some((r) => r.masterCode === "BA-24"))) {
      await tx.update(cabinets).set({ masterCode: "BA-24" }).where(eq(cabinets.id, baRow.id));
      for (const alias of ["BEC-24", "BEC24"]) {
        await tx.insert(cabinetAliases).values({ cabinetId: baRow.id, alias }).onDuplicateKeyUpdate({ set: { cabinetId: baRow.id } });
        await tx.insert(skuMasterAliases).values({ aliasCode: alias, masterCode: "BA-24", conflictStatus: "ok", notes: "Canonical master selected by complete master/alias audit; legacy BEC code preserved." }).onDuplicateKeyUpdate({ set: { masterCode: "BA-24", conflictStatus: "ok", notes: "Canonical master selected by complete master/alias audit; legacy BEC code preserved." } });
      }
    }

    for (const decision of decisions) {
      const masterId = decision.masterId;
      const masterCode = decision.masterCode;
      const masterRow = cabinetRows.find((r) => r.id === masterId)!;
      // No cabinet row is retired or hidden. The canonical master is selected
      // for resolution, while every historical source row remains active and
      // visible in admin/search as an alias-backed record. Public product
      // queries use isCanonicalCabinetMaster() to avoid duplicate listings.
      const componentRows = rowsByRoot.get(decision.root) ?? [];
      for (const componentRow of componentRows) {
        await tx.update(cabinets).set({ isActive: true, showInCatalog: true, showInDesigner: true }).where(eq(cabinets.id, componentRow.id));
      }
      const existingCanonicalAlias = skuAliasRows.find((row) => row.aliasCode === masterRow.masterCode);
      if (existingCanonicalAlias) {
        await tx.update(skuMasterAliases).set({ masterCode, conflictStatus: "ok", notes: "Canonical master selected by complete master/alias coverage audit; canonical self-alias retained for history." }).where(eq(skuMasterAliases.id, existingCanonicalAlias.id));
      }
      for (const alias of decision.aliases) {
        if (!alias || norm(alias) === norm(masterCode)) continue;
        await tx.insert(skuMasterAliases).values({ aliasCode: alias, masterCode, conflictStatus: "ok", notes: "Canonical master selected by complete master/alias coverage audit; legacy code preserved." }).onDuplicateKeyUpdate({ set: { masterCode, conflictStatus: "ok", notes: "Canonical master selected by complete master/alias coverage audit; legacy code preserved." } });
        await tx.insert(cabinetAliases).values({ cabinetId: masterId, alias }).onDuplicateKeyUpdate({ set: { cabinetId: masterId } });
      }
      for (const sourceId of decision.sourceRows) {
        const source = cabinetRows.find((r) => r.id === sourceId)!;
        const alias = source.masterCode;
        if (!alias || norm(alias) === norm(masterCode)) continue;
        await tx.insert(skuMasterAliases).values({ aliasCode: alias, masterCode, conflictStatus: "ok", notes: "Canonical master selected by complete master/alias coverage audit; historical cabinet code preserved." }).onDuplicateKeyUpdate({ set: { masterCode, conflictStatus: "ok", notes: "Canonical master selected by complete master/alias coverage audit; historical cabinet code preserved." } });
        await tx.insert(cabinetAliases).values({ cabinetId: masterId, alias }).onDuplicateKeyUpdate({ set: { cabinetId: masterId } });
      }
    }
  });

  console.log(JSON.stringify({
    componentCount: decisions.length,
    promotedMasterCount: decisions.filter((d) => d.promoted).length,
    ba24Resolved: !!baRow,
    decisions: decisions.map((d) => ({ masterId: d.masterId, masterCode: d.masterCode, promoted: d.promoted, aliasCount: d.aliases.length, sourceRows: d.sourceRows.length })),
  }, null, 2));
}
main().catch((error) => { console.error(error); process.exit(1); });
