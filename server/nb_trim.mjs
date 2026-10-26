import { getDb } from "./db.ts";
import { sql } from "drizzle-orm";
const db = await getDb();
const q = async (s) => { const r = await db.execute(sql.raw(s)); return Array.isArray(r) ? r[0] : (r.rows ?? r); };
const cabs = await q(`
  SELECT id, masterCode, category, subCategory, description
  FROM cabinets
  WHERE LOWER(description) REGEXP 'toe kick|crown|light rail|batten|moulding|molding|filler|scribe|valance'
     OR masterCode REGEXP '^(TK|CM|LRM|BAM|LCM|BF|SF|VAL|SCR)'
  ORDER BY masterCode LIMIT 120;
`);
console.log("=== TRIM-LIKE CABINET RECORDS (", cabs.length, ") ===");
for (const c of cabs) console.log(c.id, "|", c.masterCode, "|", c.category, "/", c.subCategory, "|", (c.description||"").slice(0,55));
const ids = cabs.map(c=>c.id);
if (ids.length){
  const skus = await q(`
    SELECT c.masterCode, COUNT(*) n, MIN(s.listPrice) minlist, MAX(s.listPrice) maxlist
    FROM distributor_skus s JOIN cabinets c ON c.id=s.cabinetId
    WHERE s.distributorId=2 AND s.cabinetId IN (${ids.join(",")})
    GROUP BY c.masterCode ORDER BY c.masterCode;
  `);
  console.log("\n=== CLARK&SON (dist 2) PRICED SKUS FOR THOSE CABS ===");
  for (const r of skus) console.log(r.masterCode, "| skus:", r.n, "| list:", r.minlist, "-", r.maxlist);
}
process.exit(0);
