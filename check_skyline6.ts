import { getDb } from "./server/db";
import { sql } from "drizzle-orm";

async function main() {
  const db = await getDb();
  if (!db) { process.exit(1); }
  
  // Count nulls vs set prices
  const r1 = await db.execute(sql`
    SELECT 
      SUM(homeownerPrice IS NULL) as null_homeowner,
      SUM(homeownerPrice IS NOT NULL) as has_homeowner,
      SUM(listPrice IS NULL) as null_list,
      SUM(listPrice IS NOT NULL) as has_list,
      SUM(styleId IS NULL) as null_style
    FROM distributor_skus WHERE distributorId = 3
  `);
  console.log("Price stats:", JSON.stringify((r1[0] as any[])[0]));
  
  // Sample with prices
  const r2 = await db.execute(sql`
    SELECT ds.id, ds.platformSku, ds.homeownerPrice, ds.listPrice, ds.yourCost, ds.styleId,
           dst.styleCode, dst.ourName
    FROM distributor_skus ds
    LEFT JOIN door_styles dst ON ds.styleId = dst.id
    WHERE ds.distributorId = 3 AND ds.homeownerPrice IS NOT NULL
    LIMIT 5
  `);
  console.log("Sample priced SKUs:", JSON.stringify((r2[0] as any[]), null, 2));
  
  // Check if any are isPublished=false
  const r3 = await db.execute(sql`
    SELECT SUM(isPublished = 1) as published, SUM(isPublished = 0) as unpublished, SUM(isPublished IS NULL) as null_pub
    FROM distributor_skus WHERE distributorId = 3
  `);
  console.log("Published stats:", JSON.stringify((r3[0] as any[])[0]));
  
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
