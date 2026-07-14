import { getDb } from "./server/db";
import { sql } from "drizzle-orm";

async function main() {
  const db = await getDb();
  if (!db) { process.exit(1); }

  const rows = await db.execute(sql`
    SELECT ds.id, ds.platformSku, ds.styleId, ds.listPrice, ds.yourCost, ds.homeownerPrice,
           dst.styleCode, dst.ourName
    FROM distributor_skus ds
    LEFT JOIN door_styles dst ON dst.id = ds.styleId
    WHERE ds.distributorId = 3 AND ds.platformSku = 'BBC36'
    LIMIT 15
  `);
  console.log("BBC36 rows:");
  for (const r of (rows[0] as any[])) {
    console.log(`  id=${r.id}, sku="${r.platformSku}", styleId=${r.styleId}, styleCode=${r.styleCode}, list=${r.listPrice}, cost=${r.yourCost}`);
  }
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
