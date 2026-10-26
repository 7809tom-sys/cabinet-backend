/**
 * apply_xlsx_update.mjs
 * Applies update2026-08-05.xlsx to the cabinets table.
 * Updates: description, category, subCategory, placementType, width, height, depth,
 *          numberOfDoors, numberOfDrawers, hingeSide, isCornerCabinet,
 *          altSku1, altSku2, altSku3, isActive, graphicType
 *
 * Run: node server/apply_xlsx_update.mjs /home/ubuntu/upload/update2026-08-05.xlsx
 */
import { readFileSync } from "fs";
import { createConnection } from "mysql2/promise";
import * as XLSX from "xlsx";

const xlsxPath = process.argv[2] || "/home/ubuntu/upload/update2026-08-05.xlsx";
const DRY_RUN = process.argv.includes("--dry-run");

const CAT_MAP = {
  "american disability act cabinet": "ADA",
  "ada": "ADA",
  "base": "Base",
  "wall": "Wall",
  "tall": "Tall",
  "vanity": "Vanity",
  "accessory": "Accessory",
  "molding": "Molding",
  "filler": "Filler",
  "panel": "Panel",
};

function normalizeCategory(raw) {
  if (!raw) return null;
  const lc = raw.trim().toLowerCase();
  return CAT_MAP[lc] ?? raw.trim();
}

function toNum(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function toInt(v) {
  if (v == null || v === "") return null;
  const n = parseInt(String(v), 10);
  return isNaN(n) ? null : n;
}

function toStr(v) {
  if (v == null || v === "") return null;
  return String(v).trim() || null;
}

function toBool(v) {
  if (v == null) return null;
  const s = String(v).trim().toLowerCase();
  if (s === "true" || s === "1" || s === "yes") return 1;
  if (s === "false" || s === "0" || s === "no") return 0;
  return null;
}

async function main() {
  console.log(`Reading: ${xlsxPath}`);
  const buf = readFileSync(xlsxPath);
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null });

  console.log(`Rows in sheet: ${rows.length}`);
  if (DRY_RUN) console.log("DRY RUN — no DB writes");

  const conn = await createConnection(process.env.DATABASE_URL);

  let updated = 0, notFound = 0, skipped = 0, errors = 0;
  const notFoundCodes = [];

  for (const row of rows) {
    const code = toStr(row.masterCode);
    if (!code) { skipped++; continue; }

    const patch = {};

    const desc = toStr(row.description);
    if (desc !== null) patch.description = desc;

    const cat = normalizeCategory(row.category);
    if (cat !== null) patch.category = cat;

    const sub = toStr(row.subCategory);
    patch.subCategory = sub; // allow null to clear it

    const pt = toStr(row.placementType);
    if (pt !== null) patch.placementType = pt;

    const w = toNum(row.width);
    if (w !== null) patch.width = String(w);

    const h = toNum(row.height);
    if (h !== null) patch.height = String(h);

    const d = toNum(row.depth);
    if (d !== null) patch.depth = String(d);

    const doors = toInt(row.numberOfDoors);
    if (doors !== null) patch.numberOfDoors = doors;

    const drawers = toInt(row.numberOfDrawers);
    if (drawers !== null) patch.numberOfDrawers = drawers;

    const gt = toStr(row.graphicType);
    patch.graphicType = gt; // allow null to clear it

    const hs = toStr(row.hingeSide);
    if (hs !== null) patch.hingeSide = hs;

    const ic = toBool(row.isCornerCabinet);
    if (ic !== null) patch.isCornerCabinet = ic;

    const a1 = toStr(row.altSku1);
    patch.altSku1 = a1;
    const a2 = toStr(row.altSku2);
    patch.altSku2 = a2;
    const a3 = toStr(row.altSku3);
    patch.altSku3 = a3;

    const active = toBool(row.isActive);
    if (active !== null) patch.isActive = active;

    if (Object.keys(patch).length === 0) { skipped++; continue; }

    if (DRY_RUN) {
      updated++;
      continue;
    }

    try {
      const setClauses = Object.keys(patch).map(k => `\`${k}\` = ?`).join(", ");
      const values = [...Object.values(patch), code];
      const [result] = await conn.execute(
        `UPDATE cabinets SET ${setClauses} WHERE masterCode = ?`,
        values
      );
      if (result.affectedRows > 0) {
        updated++;
      } else {
        notFound++;
        if (notFoundCodes.length < 20) notFoundCodes.push(code);
      }
    } catch (err) {
      errors++;
      console.error(`Error updating ${code}:`, err.message);
    }
  }

  await conn.end();

  console.log(`\n=== Results ===`);
  console.log(`Updated:  ${updated}`);
  console.log(`Not found: ${notFound}`);
  console.log(`Skipped:  ${skipped}`);
  console.log(`Errors:   ${errors}`);
  if (notFoundCodes.length > 0) {
    console.log(`Not found codes (first 20): ${notFoundCodes.join(", ")}`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
