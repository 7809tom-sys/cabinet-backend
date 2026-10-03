// Dry-run: compare the 2026-10-03 master sheet to the live `cabinets` table.
// Writes nothing. Prints a summary and saves the full diff to /tmp/master_diff.json
import "dotenv/config";
import mysql from "mysql2/promise";
import ExcelJS from "exceljs";
import fs from "node:fs";

const FILE = "/home/ubuntu/upload/cabinetdealz_master_UPDATED_2026-10-03.xlsx";
const norm = (s) => (s ?? "").toString().toUpperCase().replace(/[\s\-.]/g, "").replace(/^0(?=\d)/, "");
const str = (v) => (v === null || v === undefined ? null : (typeof v === "object" && v.richText ? v.richText.map((r) => r.text).join("") : String(v)).trim());
const num = (v) => { const s = str(v); if (s === null || s === "") return null; const n = parseFloat(s); return Number.isFinite(n) ? n : null; };
const bool = (v) => { const s = str(v); return s === null ? null : /^(true|1|yes)$/i.test(s); };

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(FILE);
const ws = wb.getWorksheet("Cabinets (updated)");
const header = ws.getRow(1).values.slice(1).map(str);
const col = (name) => header.indexOf(name) + 1;
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
    designerEligible: str(g("designerEligible")), changeStatus: str(g("changeStatus")), changeNote: str(g("changeNote")), family: str(g("family")),
  });
});

const aliasWs = wb.getWorksheet("Alias map");
const ah = aliasWs.getRow(1).values.slice(1).map(str);
const aliases = [];
aliasWs.eachRow((row, i) => { if (i === 1) return; const o = {}; ah.forEach((h, k) => (o[h] = str(row.getCell(k + 1).value))); aliases.push(o); });

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [dbRows] = await conn.query("SELECT id, masterCode, description, category, subCategory, placementType, width, height, depth, numberOfDoors, numberOfDrawers, hingeSide, isCornerCabinet, cornerSide, graphicType, isActive, sku, vendorSku, altSku1, altSku2, altSku3, showInDesigner FROM cabinets");
const [dbAliases] = await conn.query("SELECT a.alias, a.cabinetId, c.masterCode FROM cabinet_aliases a JOIN cabinets c ON c.id=a.cabinetId");
await conn.end();

const byNorm = new Map();
for (const r of dbRows) { const k = norm(r.masterCode); if (!byNorm.has(k)) byNorm.set(k, []); byNorm.get(k).push(r); }
const dbAliasByNorm = new Map(dbAliases.map((a) => [norm(a.alias), a]));

const fields = ["description", "category", "subCategory", "placementType", "width", "height", "depth", "numberOfDoors", "numberOfDrawers", "hingeSide", "isCornerCabinet", "cornerSide", "graphicType", "isActive", "sku", "vendorSku", "altSku1", "altSku2", "altSku3"];
const eq = (a, b) => {
  if (a === null || a === undefined || a === "") return b === null || b === undefined || b === "";
  if (typeof a === "number") return Math.abs(a - (parseFloat(b) || 0)) < 1e-6;
  if (typeof a === "boolean") return a === !!(b === true || b === 1 || b === "1");
  return String(a).trim() === String(b ?? "").trim();
};

const out = { exactMatch: 0, normMatchDifferentCode: [], missingInDb: [], ambiguous: [], fieldChanges: {}, rows: [] };
const seenDbIds = new Set();
for (const s of sheet) {
  const k = norm(s.masterCode);
  const cands = byNorm.get(k) ?? [];
  if (cands.length === 0) { out.missingInDb.push({ sheetRow: s.sheetRow, masterCode: s.masterCode, isActive: s.isActive, changeStatus: s.changeStatus }); continue; }
  if (cands.length > 1) out.ambiguous.push({ masterCode: s.masterCode, dbCodes: cands.map((c) => c.masterCode) });
  const db = cands.find((c) => c.masterCode === s.masterCode) ?? cands[0];
  seenDbIds.add(db.id);
  if (db.masterCode === s.masterCode) out.exactMatch++; else out.normMatchDifferentCode.push({ sheet: s.masterCode, db: db.masterCode });
  const diffs = {};
  for (const f of fields) if (!eq(s[f], db[f])) { diffs[f] = { sheet: s[f], db: db[f] }; out.fieldChanges[f] = (out.fieldChanges[f] ?? 0) + 1; }
  if (Object.keys(diffs).length) out.rows.push({ sheetRow: s.sheetRow, masterCode: s.masterCode, dbId: db.id, dbCode: db.masterCode, changeStatus: s.changeStatus, diffs });
}
out.dbNotInSheet = dbRows.filter((r) => !seenDbIds.has(r.id)).map((r) => ({ id: r.id, masterCode: r.masterCode, isActive: r.isActive }));

// alias analysis: ACTIVE alias rows in sheet that are not master codes themselves
const activeAliases = aliases.filter((a) => /ACTIVE alias/i.test(a.aliasStatus ?? ""));
out.aliasStats = { sheetActiveAliases: activeAliases.length, alreadyInDb: 0, newAliases: [], aliasCollidesWithMaster: [] };
for (const a of activeAliases) {
  const k = norm(a.alias);
  if (byNorm.has(k) && !byNorm.get(k).some((c) => norm(c.masterCode) === norm(a.masterCode))) { out.aliasStats.aliasCollidesWithMaster.push({ alias: a.alias, master: a.masterCode, dbMaster: byNorm.get(k)[0].masterCode }); continue; }
  if (dbAliasByNorm.has(k)) out.aliasStats.alreadyInDb++; else out.aliasStats.newAliases.push({ alias: a.alias, master: a.masterCode });
}

fs.writeFileSync("/tmp/master_diff.json", JSON.stringify(out, null, 1));
console.log("sheet rows", sheet.length, "| db rows", dbRows.length);
console.log("exact code match", out.exactMatch, "| matched via normalization (code differs)", out.normMatchDifferentCode.length, "| missing in DB", out.missingInDb.length, "| ambiguous", out.ambiguous.length);
console.log("db rows not in sheet", out.dbNotInSheet.length);
console.log("rows with field changes", out.rows.length);
console.log("field change counts", out.fieldChanges);
console.log("aliases: active in sheet", out.aliasStats.sheetActiveAliases, "| already in DB", out.aliasStats.alreadyInDb, "| new", out.aliasStats.newAliases.length, "| collide with existing master", out.aliasStats.aliasCollidesWithMaster.length);
console.log("sample missingInDb", out.missingInDb.slice(0, 12));
console.log("sample code renames", out.normMatchDifferentCode.slice(0, 12));
console.log("sample collisions", out.aliasStats.aliasCollidesWithMaster.slice(0, 10));
