import { getDb } from "./server/db";
import { sql } from "drizzle-orm";

async function main() {
  const db = await getDb();
  if (!db) { process.exit(1); }
  
  // Find 2DB24 for Skyline (distributorId=3), style SE
  const r = await db.execute(sql`
    SELECT ds.id, ds.platformSku, ds.distributorSku, ds.homeownerPrice, ds.listPrice, ds.yourCost,
           ds.adjustedListPrice, ds.wholesalePrice, ds.styleId,
           dst.styleCode, dst.ourName
    FROM distributor_skus ds
    LEFT JOIN door_styles dst ON ds.styleId = dst.id
    WHERE ds.distributorId = 3
      AND (ds.platformSku LIKE '%2DB24%' OR ds.distributorSku LIKE '%2DB24%')
    LIMIT 10
  `);
  console.log("2DB24 Skyline rows:", JSON.stringify(r[0], null, 2));
  
  // Also check the master cabinet record
  const r2 = await db.execute(sql`
    SELECT id, masterCode, description, width, height, depth
    FROM cabinets
    WHERE masterCode LIKE '%2DB24%'
    LIMIT 5
  `);
  console.log("Master cabinet 2DB24:", JSON.stringify(r2[0], null, 2));
  
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
