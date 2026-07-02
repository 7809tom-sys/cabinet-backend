import { getDb } from "./db.ts";
import { sql } from "drizzle-orm";
const db = await getDb();
const q = async (s) => { const r = await db.execute(sql.raw(s)); return Array.isArray(r) ? r[0] : (r.rows ?? r); };
// All crown-ish codes and their per-style SKU coverage for dist 2
const rows = await q(`
  SELECT c.masterCode, COUNT(DISTINCT s.styleId) styles, COUNT(*) n, MIN(s.listPrice) minl, MAX(s.listPrice) maxl
  FROM cabinets c JOIN distributor_skus s ON s.cabinetId=c.id
  WHERE s.distributorId=2
    AND (c.masterCode REGEXP '^(CM|COV|BCM|ACM|RCM|FBM|OCM)' )
  GROUP BY c.masterCode ORDER BY styles DESC, c.masterCode;
`);
console.log("=== CROWN-ish codes, Clark&Son per-style coverage ===");
for (const r of rows) console.log(r.masterCode, "| styles:", r.styles, "| skus:", r.n, "| list:", r.minl, "-", r.maxl);
// how many total door styles does dist 2 have with skus
const st = await q(`SELECT COUNT(DISTINCT styleId) n FROM distributor_skus WHERE distributorId=2;`);
console.log("\nClark&Son distinct styleIds in skus:", st[0].n);
process.exit(0);
