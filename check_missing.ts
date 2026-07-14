import { getDb } from "./server/db";
import { sql } from "drizzle-orm";

async function main() {
  const db = await getDb();
  if (!db) { process.exit(1); }

  // Get distinct master codes with no listPrice
  const missing = await db.execute(sql`
    SELECT DISTINCT 
      SUBSTRING_INDEX(platformSku, '-', 1) as masterCode,
      COUNT(*) as cnt
    FROM distributor_skus 
    WHERE distributorId = 3 AND (listPrice IS NULL OR listPrice = 0)
    GROUP BY masterCode
    ORDER BY masterCode
    LIMIT 30
  `);
  console.log("Master codes with missing prices:");
  for (const r of (missing[0] as any[])) {
    console.log(`  ${r.masterCode}: ${r.cnt} SKUs`);
  }

  // Total distinct master codes missing
  const totalMissing = await db.execute(sql`
    SELECT COUNT(DISTINCT SUBSTRING_INDEX(platformSku, '-', 1)) as cnt
    FROM distributor_skus 
    WHERE distributorId = 3 AND (listPrice IS NULL OR listPrice = 0)
  `);
  console.log("\nTotal distinct master codes missing prices:", (totalMissing[0] as any[])[0].cnt);

  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
