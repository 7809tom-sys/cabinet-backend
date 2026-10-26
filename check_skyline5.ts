import { getDb } from "./server/db";
import { doorStyles, distributorSkus } from "./drizzle/schema";
import { eq, isNotNull, and, sql } from "drizzle-orm";

async function main() {
  const db = await getDb();
  if (!db) { process.exit(1); }
  
  try {
    const rows = await db.execute(sql`
      SELECT ds.master_code, ds.homeowner_price, ds.list_price, ds.your_cost, ds.style_id,
             dst.style_code, dst.our_name
      FROM distributor_skus ds
      LEFT JOIN door_styles dst ON ds.style_id = dst.id
      WHERE ds.distributor_id = 3 AND ds.homeowner_price IS NOT NULL
      LIMIT 5
    `);
    console.log("Sample Skyline SKUs:", JSON.stringify(rows[0], null, 2));
  } catch(e: any) {
    console.error("Query error:", e.message);
  }
  
  try {
    const styles = await db.execute(sql`
      SELECT id, style_code, our_name FROM door_styles WHERE distributor_id = 3 LIMIT 10
    `);
    console.log("Skyline door styles:", JSON.stringify(styles[0], null, 2));
  } catch(e: any) {
    console.error("Styles error:", e.message);
  }
  
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
