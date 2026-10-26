// Read-only export of the current catalog for the Skyline refresh reconciliation.
// Writes two CSVs to /home/ubuntu/milestone_catalogs/db_export/.
import mysql from "mysql2/promise";
import { writeFileSync, mkdirSync } from "node:fs";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

function toCsv(rows) {
  if (rows.length === 0) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

const conn = await mysql.createConnection(url);

const [cabs] = await conn.query(
  `SELECT id, masterCode, description, descriptionSource, category, subCategory,
          width, height, depth, numberOfDoors, numberOfDrawers, isCornerCabinet,
          graphicType, isActive, conflictStatus
   FROM cabinets ORDER BY masterCode`
);
const [styles] = await conn.query(
  `SELECT ds.id, ds.styleCode, ds.ourName, ds.aliasName, ds.distributorName, ds.doorStyle,
          ds.woodSpecies, ds.finish, ds.color, ds.isActive,
          (SELECT COUNT(*) FROM distributor_skus s WHERE s.styleId = ds.id) AS skuCount
   FROM door_styles ds ORDER BY ds.styleCode`
);

const dir = "/home/ubuntu/milestone_catalogs/db_export";
mkdirSync(dir, { recursive: true });
writeFileSync(dir + "/cabinets.csv", toCsv(cabs));
writeFileSync(dir + "/door_styles.csv", toCsv(styles));

console.log("cabinets:", cabs.length, "door_styles:", styles.length);
// quick description quality stats
const shortDesc = cabs.filter((c) => !c.description || c.description.trim().length < 12).length;
const upperOnly = cabs.filter((c) => c.description && c.description === c.description.toUpperCase() && /[A-Z]/.test(c.description)).length;
console.log("short/empty desc:", shortDesc, "| all-caps desc:", upperOnly);
await conn.end();
