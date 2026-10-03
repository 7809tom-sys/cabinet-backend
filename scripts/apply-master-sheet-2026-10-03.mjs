// Apply the NON-PRICE changes from the 2026-10-03 master sheet to the live catalog.
//   node scripts/apply-master-sheet-2026-10-03.mjs            → dry run (prints plan, writes nothing)
//   node scripts/apply-master-sheet-2026-10-03.mjs --apply    → applies in one transaction
//
// HARD RULE (owner, 2026-10-03): NO PRICING CHANGES. This script never reads or writes
// distributor_skus, pricing_settings, door_styles, or any tier/markup/eligibility field.
// Cabinet ids are never changed, so every existing price stays attached to its cabinet.
//
// What it does, per sheet row (matched to cabinets by exact code, then by normalized code):
//   1. cabinet_recovery_snapshots row (reason "before-master-sheet-2026-10-03") for every row touched
//   2. originalDescription  ← sheet.originalDescription (only if currently NULL — never overwritten)
//      homeownerDescription ← sheet.homeownerDescription
//      description          ← sheet.description (designer text incl. "Looks like")
//   3. spec fields: category, subCategory, placementType, width, height, depth, numberOfDoors,
//      numberOfDrawers, hingeSide, isCornerCabinet, cornerSide, graphicType, sku, vendorSku, altSku1-3
//   4. isActive ← sheet.isActive (merged / archived rows become inactive; never deleted — rule 5)
//   5. masterCode undash renames (W-2418 → W2418); the old dashed code is kept as a cabinet_aliases row
//   6. cabinet_aliases: every ACTIVE alias from the Alias map that is not itself a cabinets row
//   7. cabinet_code_equivalences: one two-way pair per MERGED-INTO-<target> row and per alias that is
//      itself a (now-inactive) cabinets row, so any legacy code placed in a design resolves to the
//      master's priced line (same mechanism as ERB36 ↔ BER36)
//   8. cabinet_config_change_log entry per field change
import "dotenv/config";
import mysql from "mysql2/promise";
import ExcelJS from "exceljs";
import fs from "node:fs";

const APPLY = process.argv.includes("--apply");
const FILE = "/home/ubuntu/upload/cabinetdealz_master_UPDATED_2026-10-03.xlsx";
const SOURCE = "master sheet 2026-10-03";
const SNAPSHOT_REASON = "before-master-sheet-2026-10-03";

const norm = (s) => (s ?? "").toString().toUpperCase().replace(/[\s\-.]/g, "").replace(/^0(?=\d)/, "");
const str = (v) => (v === null || v === undefined ? null : (typeof v === "object" && v.richText ? v.richText.map((r) => r.text).join("") : String(v)).trim() || null);
const num = (v) => { const s = str(v); if (s === null) return null; const n = parseFloat(s); return Number.isFinite(n) ? n : null; };
const bool = (v) => { const s = str(v); return s === null ? null : /^(true|1|yes)$/i.test(s); };
const eq = (a, b) => {
  if (a === null || a === undefined || a === "") return b === null || b === undefined || b === "";
  if (typeof a === "number") return b !== null && b !== undefined && Math.abs(a - parseFloat(b)) < 1e-6;
  if (typeof a === "boolean") return a === !!(b === true || b === 1 || b === "1");
  return String(a).trim() === String(b ?? "").trim();
};

// ---------- read sheet ----------
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(FILE);
const ws = wb.getWorksheet("Cabinets (updated)");
const header = ws.getRow(1).values.slice(1).map(str);
const col = (n) => header.indexOf(n) + 1;
const sheet = [];
ws.eachRow((row, i) => {
  if (i === 1) return;
  const g = (n) => row.getCell(col(n)).value;
  sheet.push({
    sheetRow: num(g("sheetRow")), masterCode: str(g("masterCode")), description: str(g("description")),
    homeownerDescription: str(g("homeownerDescription")), originalDescription: str(g("originalDescription")),
    category: str(g("category")), subCategory: str(g("subCategory")), placementType: str(g("placementType")),
    width: num(g("width")), height: num(g("height")), depth: num(g("depth")),
    numberOfDoors: num(g("numberOfDoors")), numberOfDrawers: num(g("numberOfDrawers")), hingeSide: str(g("hingeSide")),
    isCornerCabinet: bool(g("isCornerCabinet")), cornerSide: str(g("cornerSide")), graphicType: str(g("graphicType")),
    isActive: bool(g("isActive")), sku: str(g("sku")), vendorSku: str(g("vendorSku")), altSku1: str(g("altSku1")), altSku2: str(g("altSku2")), altSku3: str(g("altSku3")),
    changeStatus: str(g("changeStatus")), family: str(g("family")),
  });
});
const aliasWs = wb.getWorksheet("Alias map");
const ah = aliasWs.getRow(1).values.slice(1).map(str);
const aliasRows = [];
aliasWs.eachRow((row, i) => { if (i === 1) return; const o = {}; ah.forEach((h, k) => (o[h] = str(row.getCell(k + 1).value))); aliasRows.push(o); });

// ---------- read db ----------
const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [dbRows] = await conn.query("SELECT * FROM cabinets");
const [dbAliases] = await conn.query("SELECT alias, cabinetId FROM cabinet_aliases");
const [dbEq] = await conn.query("SELECT codeA, codeB FROM cabinet_code_equivalences");
const byNorm = new Map();
for (const r of dbRows) { const k = norm(r.masterCode); byNorm.set(k, [...(byNorm.get(k) ?? []), r]); }
const byCode = new Map(dbRows.map((r) => [r.masterCode, r]));
const aliasNormSet = new Set(dbAliases.map((a) => norm(a.alias)));
const eqSet = new Set(dbEq.flatMap((e) => [norm(e.codeA) + "|" + norm(e.codeB), norm(e.codeB) + "|" + norm(e.codeA)]));

const SPEC_FIELDS = ["category", "subCategory", "placementType", "width", "height", "depth", "numberOfDoors", "numberOfDrawers", "hingeSide", "isCornerCabinet", "cornerSide", "graphicType", "sku", "vendorSku", "altSku1", "altSku2", "altSku3"];

// ---------- plan ----------
const plan = { updates: [], renames: [], aliases: [], equivalences: [], unmatched: [], skipped: [] };
const claimed = new Set();
const resolve = (s) => {
  const exact = byCode.get(s.masterCode);
  if (exact && !claimed.has(exact.id)) return exact;
  const cands = (byNorm.get(norm(s.masterCode)) ?? []).filter((c) => !claimed.has(c.id));
  if (cands[0]) return cands[0];
  // "V-36-TDL(V36TDL)" style codes: the parenthetical is the sheet's master code
  const paren = dbRows.find((c) => !claimed.has(c.id) && /\(([^)]+)\)$/.test(c.masterCode) && norm(c.masterCode.match(/\(([^)]+)\)$/)[1]) === norm(s.masterCode));
  return paren ?? null;
};
for (const s of sheet) {
  const db = resolve(s);
  if (!db) { plan.unmatched.push(s.masterCode); continue; }
  claimed.add(db.id);
  const set = {}; const log = [];
  const push = (f, v) => { set[f] = v; log.push({ field: f, oldValue: db[f], newValue: v }); };
  if (s.description && !eq(s.description, db.description)) push("description", s.description);
  if (s.homeownerDescription && !eq(s.homeownerDescription, db.homeownerDescription)) push("homeownerDescription", s.homeownerDescription);
  if (s.originalDescription && db.originalDescription == null) push("originalDescription", s.originalDescription);
  for (const f of SPEC_FIELDS) if (s[f] !== null && !eq(s[f], db[f])) push(f, typeof s[f] === "boolean" ? (s[f] ? 1 : 0) : s[f]);
  if (s.isActive !== null && !eq(s.isActive, db.isActive)) push("isActive", s.isActive ? 1 : 0);
  let rename = null;
  if (s.masterCode !== db.masterCode) {
    if (byCode.has(s.masterCode)) plan.skipped.push({ code: s.masterCode, reason: `target code already exists (${db.masterCode})` });
    else { rename = { from: db.masterCode, to: s.masterCode }; push("masterCode", s.masterCode); plan.renames.push({ id: db.id, ...rename }); }
  }
  // merged-into → equivalence pair (two-way), legacy code already in cabinets table so no alias row
  const m = (s.changeStatus ?? "").match(/MERGED-INTO-([A-Z0-9()\-.]+)/i);
  if (m) {
    const target = (byNorm.get(norm(m[1])) ?? []).find((c) => c.id !== db.id);
    if (target) {
      const key = norm(s.masterCode) + "|" + norm(target.masterCode);
      if (!eqSet.has(key)) { eqSet.add(key); eqSet.add(norm(target.masterCode) + "|" + norm(s.masterCode)); plan.equivalences.push({ codeA: s.masterCode, codeB: target.masterCode, family: s.family, notes: `${SOURCE}: ${s.masterCode} merged into ${target.masterCode} (row ${s.sheetRow})` }); }
    }
  }
  if (Object.keys(set).length) plan.updates.push({ id: db.id, code: db.masterCode, set, log, rename });
}
// renames: keep the dashed code as an alias
for (const r of plan.renames) if (!aliasNormSet.has(norm(r.from)) || true) plan.aliases.push({ cabinetId: r.id, alias: r.from, note: "pre-rename code" });
// alias map
for (const a of aliasRows) {
  if (!/ACTIVE alias/i.test(a.aliasStatus ?? "")) continue;
  const master = (byNorm.get(norm(a.masterCode)) ?? [])[0];
  if (!master) continue;
  const k = norm(a.alias);
  const asCabinet = (byNorm.get(k) ?? []).find((c) => c.id !== master.id);
  if (asCabinet) {
    const key = k + "|" + norm(master.masterCode);
    if (!eqSet.has(key)) { eqSet.add(key); eqSet.add(norm(master.masterCode) + "|" + k); plan.equivalences.push({ codeA: asCabinet.masterCode, codeB: master.masterCode, family: a.family, notes: `${SOURCE}: alias ${a.alias} of ${a.masterCode} is its own catalog row` }); }
    continue;
  }
  if (aliasNormSet.has(k) || (byNorm.get(k) ?? []).some((c) => c.id === master.id)) continue;
  aliasNormSet.add(k);
  plan.aliases.push({ cabinetId: master.id, alias: a.alias, note: a.source });
}
// de-dupe aliases by exact alias text
const seenAlias = new Set();
plan.aliases = plan.aliases.filter((a) => { if (seenAlias.has(a.alias)) return false; seenAlias.add(a.alias); return true; });

const fieldCounts = {};
for (const u of plan.updates) for (const l of u.log) fieldCounts[l.field] = (fieldCounts[l.field] ?? 0) + 1;
const summary = {
  mode: APPLY ? "APPLY" : "DRY RUN", sheetRows: sheet.length, dbRows: dbRows.length,
  rowsToUpdate: plan.updates.length, fieldCounts, renames: plan.renames.length, newAliases: plan.aliases.length,
  newEquivalences: plan.equivalences.length, unmatched: plan.unmatched, skipped: plan.skipped,
  deactivations: plan.updates.filter((u) => u.set.isActive === 0).length, reactivations: plan.updates.filter((u) => u.set.isActive === 1).length,
};
console.log(JSON.stringify(summary, null, 1));
fs.writeFileSync("/tmp/master_apply_plan.json", JSON.stringify(plan, null, 1));

if (!APPLY) { await conn.end(); console.log("DRY RUN — nothing written. Plan at /tmp/master_apply_plan.json"); process.exit(0); }

// ---------- apply ----------
await conn.beginTransaction();
try {
  let snaps = 0, logs = 0;
  for (const u of plan.updates) {
    const row = dbRows.find((r) => r.id === u.id);
    await conn.query("INSERT INTO cabinet_recovery_snapshots (cabinetId, masterCode, reason, rowJson, takenByName) VALUES (?,?,?,?,?)", [u.id, row.masterCode, SNAPSHOT_REASON, JSON.stringify(row), SOURCE]);
    snaps++;
    const cols = Object.keys(u.set);
    await conn.query(`UPDATE cabinets SET ${cols.map((c) => `\`${c}\` = ?`).join(", ")}, configuredAt = NOW() WHERE id = ?`, [...cols.map((c) => u.set[c]), u.id]);
    for (const l of u.log) {
      await conn.query("INSERT INTO cabinet_config_change_log (cabinetId, masterCode, scope, field, oldValueJson, newValueJson, changedByName) VALUES (?,?,?,?,?,?,?)", [u.id, u.rename?.to ?? row.masterCode, "master", l.field, JSON.stringify(l.oldValue ?? null), JSON.stringify(l.newValue ?? null), SOURCE]);
      logs++;
    }
  }
  for (const a of plan.aliases) await conn.query("INSERT IGNORE INTO cabinet_aliases (cabinetId, alias) VALUES (?,?)", [a.cabinetId, a.alias]);
  for (const e of plan.equivalences) await conn.query("INSERT IGNORE INTO cabinet_code_equivalences (codeA, codeB, family, notes, isActive) VALUES (?,?,?,?,1)", [e.codeA, e.codeB, e.family, e.notes]);
  await conn.commit();
  console.log(`APPLIED: ${plan.updates.length} cabinets updated, ${snaps} snapshots, ${logs} change-log rows, ${plan.aliases.length} aliases, ${plan.equivalences.length} equivalences.`);
} catch (err) {
  await conn.rollback();
  console.error("ROLLED BACK:", err);
  process.exitCode = 1;
} finally {
  await conn.end();
}
