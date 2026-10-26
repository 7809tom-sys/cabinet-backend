import mysql from "mysql2/promise";
import fs from "fs";

const url = fs.readFileSync("/tmp/dburl.txt", "utf8").trim();
const conn = await mysql.createConnection(url);

const like = (s) => `%${s}%`;
const [rows] = await conn.execute(
  `SELECT id, masterCode, description, category, subCategory, placementType,
          width, height, depth, isCornerCabinet, isActive, conflictStatus
   FROM cabinets
   WHERE LOWER(description) LIKE ? OR LOWER(description) LIKE ? OR LOWER(description) LIKE ?
      OR LOWER(description) LIKE ? OR LOWER(masterCode) LIKE ? OR LOWER(masterCode) LIKE ?
      OR isCornerCabinet = 1
   ORDER BY placementType, masterCode`,
  [like("lazy susan"), like("easy reach"), like("corner"),
   like("susan"), like("ls"), like("er")]
);

const out = [];
out.push(`Found ${rows.length} corner/lazy-susan/easy-reach rows:\n`);
for (const r of rows) {
  out.push(
    `${r.masterCode} | place=${r.placementType} | cat=${r.category} | sub=${r.subCategory} | ` +
    `${r.width}x${r.height}x${r.depth} | corner=${r.isCornerCabinet} | active=${r.isActive} | conflict=${r.conflictStatus} | ${String(r.description).slice(0,70)}`
  );
}

const [buckets] = await conn.execute(
  `SELECT placementType, subCategory, COUNT(*) n FROM cabinets WHERE isActive=1 AND (conflictStatus IS NULL OR conflictStatus <> 'conflict') GROUP BY placementType, subCategory ORDER BY placementType, n DESC`
);
out.push(`\n=== placementType / subCategory buckets (active, non-conflict) ===`);
for (const b of buckets) out.push(`${b.placementType} | ${b.subCategory} | ${b.n}`);

fs.writeFileSync("/tmp/corner_audit.txt", out.join("\n"));
console.log(out.join("\n"));
await conn.end();
