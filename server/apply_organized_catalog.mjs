/**
 * apply_organized_catalog.mjs
 * Reads the organized master catalog CSV and updates every matching cabinet in the DB.
 * Updates: description, category, subCategory, width, height, depth,
 *          numberOfDoors, numberOfDrawers, graphicType
 * Matches by masterCode (Code column).
 * Run: node server/apply_organized_catalog.mjs
 */
import fs from "fs";
import path from "path";
import { createConnection } from "mysql2/promise";
import { parse } from "csv-parse/sync";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const CSV_PATH = process.argv[2] || "/home/ubuntu/upload/cabinet-dealz-master-catalog-organized-2026-08-03.csv";

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error("DATABASE_URL not set"); process.exit(1); }

const url = new URL(DB_URL);
const conn = await createConnection({
  host: url.hostname,
  port: Number(url.port) || 3306,
  user: url.username,
  password: url.password,
  database: url.pathname.replace(/^\//, ""),
  ssl: { rejectUnauthorized: false },
});

const raw = fs.readFileSync(CSV_PATH, "utf-8");
const rows = parse(raw, { columns: true, skip_empty_lines: true, trim: true });

console.log(`Loaded ${rows.length} rows from CSV`);

let updated = 0;
let notFound = 0;
let errors = 0;
const notFoundList = [];

const CAT_MAP = {
  "base": "Base", "wall": "Wall", "tall": "Tall", "vanity": "Vanity",
  "ada": "ADA", "accessory": "Accessory", "molding": "Molding",
  "filler": "Filler", "panel": "Panel",
};

function normalizeCategory(raw) {
  if (!raw) return null;
  return CAT_MAP[raw.trim().toLowerCase()] || raw.trim();
}

function parseNum(val) {
  if (val === null || val === undefined || val === "") return null;
  const n = parseFloat(String(val).replace(/[^0-9.]/g, ""));
  return isNaN(n) ? null : n;
}

function parseInt2(val) {
  if (val === null || val === undefined || val === "") return null;
  const n = parseInt(String(val), 10);
  return isNaN(n) ? null : n;
}

for (const row of rows) {
  const code = (row.Code || "").trim();
  if (!code) continue;

  const description = (row.Description || "").trim() || null;
  const category = normalizeCategory(row.Category);
  const subCategory = (row.SubCategory || "").trim() || null;
  const width = parseNum(row.Width);
  const height = parseNum(row.Height);
  const depth = parseNum(row.Depth);
  const numberOfDoors = parseInt2(row.Doors);
  const numberOfDrawers = parseInt2(row.Drawers);
  const graphicType = (row.GraphicType || "").trim() || null;

  try {
    const [result] = await conn.execute(
      `UPDATE cabinets SET
        description = COALESCE(?, description),
        category = COALESCE(?, category),
        subCategory = ?,
        width = COALESCE(?, width),
        height = COALESCE(?, height),
        depth = COALESCE(?, depth),
        numberOfDoors = COALESCE(?, numberOfDoors),
        numberOfDrawers = COALESCE(?, numberOfDrawers),
        graphicType = ?
      WHERE masterCode = ?`,
      [
        description, category, subCategory,
        width, height, depth,
        numberOfDoors, numberOfDrawers,
        graphicType,
        code,
      ]
    );
    if (result.affectedRows > 0) {
      updated++;
    } else {
      notFound++;
      notFoundList.push(code);
    }
  } catch (err) {
    errors++;
    if (errors <= 5) console.error(`  ERROR on ${code}:`, err.message);
  }
}

await conn.end();

console.log(`\nDone: ${updated} updated, ${notFound} not found in DB, ${errors} errors`);
if (notFoundList.length > 0 && notFoundList.length <= 20) {
  console.log("Not found codes:", notFoundList.join(", "));
} else if (notFoundList.length > 20) {
  console.log("First 20 not found:", notFoundList.slice(0, 20).join(", "));
}
