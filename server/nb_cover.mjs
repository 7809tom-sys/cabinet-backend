import { getDb } from "./db.ts";
import { sql } from "drizzle-orm";
const db = await getDb();
const q = async (s) => { const r = await db.execute(sql.raw(s)); return Array.isArray(r) ? r[0] : (r.rows ?? r); };
// Clark And Son door styles (distributorId 2 door_styles)
const styles = await q(`SELECT id, styleCode, ourName FROM door_styles WHERE distributorId=2 ORDER BY id;`);
const ids = styles.map(s=>s.id);
console.log("Clark&Son door styles:", styles.map(s=>`${s.id}:${s.styleCode}`).join(", "));
for (const code of ["TK-8","LRM-8","BAM","SM-8","BF-3","BFF-3","WFF-3-42","VA-48"]) {
  const rows = await q(`
    SELECT s.styleId FROM distributor_skus s JOIN cabinets c ON c.id=s.cabinetId
    WHERE s.distributorId=2 AND c.masterCode='${code}' AND s.styleId IN (${ids.join(",")});
  `);
  const have = new Set(rows.map(r=>r.styleId));
  const missing = styles.filter(s=>!have.has(s.id)).map(s=>s.styleCode);
  console.log(`${code}: ${have.size}/${ids.length} styles`, missing.length? "| MISSING: "+missing.join(","): "| ALL");
}
process.exit(0);
