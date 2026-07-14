import { getDb } from "./server/db";
import { sql } from "drizzle-orm";

async function main() {
  const db = await getDb();
  if (!db) { process.exit(1); }

  // Count MI SKUs in DB
  const total = await db.execute(sql`
    SELECT COUNT(*) as cnt FROM distributor_skus ds
    JOIN door_styles dst ON dst.id = ds.styleId
    WHERE ds.distributorId = 3 AND dst.styleCode = 'MI'
  `);
  console.log("MI SKUs in DB:", (total[0] as any[])[0].cnt);

  // Count SE SKUs for comparison (SE is a well-populated style)
  const se = await db.execute(sql`
    SELECT COUNT(*) as cnt FROM distributor_skus ds
    JOIN door_styles dst ON dst.id = ds.styleId
    WHERE ds.distributorId = 3 AND dst.styleCode = 'SE'
  `);
  console.log("SE SKUs in DB:", (se[0] as any[])[0].cnt);

  // Show sample MI SKUs
  const sample = await db.execute(sql`
    SELECT ds.platformSku, ds.listPrice, ds.yourCost, ds.homeownerPrice
    FROM distributor_skus ds
    JOIN door_styles dst ON dst.id = ds.styleId
    WHERE ds.distributorId = 3 AND dst.styleCode = 'MI'
    LIMIT 10
  `);
  console.log("\nSample MI SKUs:");
  for (const r of (sample[0] as any[])) {
    console.log(`  ${r.platformSku}: list=${r.listPrice}, cost=${r.yourCost}, hp=${r.homeownerPrice}`);
  }

  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
