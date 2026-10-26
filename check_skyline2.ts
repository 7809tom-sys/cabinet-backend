import { getDb } from "./server/db";
import { distributors, doorStyles, distributorSkus } from "./drizzle/schema";
import { eq, count } from "drizzle-orm";

async function main() {
  const db = await getDb();
  if (!db) { console.log("No DB"); process.exit(1); }
  
  // Check distributor id=3
  const dist = await db.select().from(distributors).where(eq(distributors.id, 3));
  console.log("Distributor 3:", JSON.stringify(dist[0]));
  
  // Count SKUs for distributor 3
  const skuCount = await db.select({ total: count() }).from(distributorSkus).where(eq(distributorSkus.distributorId, 3));
  console.log("Total SKUs for distributor 3:", skuCount[0].total);
  
  // Sample SKUs
  const samples = await db.select({
    masterCode: distributorSkus.masterCode,
    homeownerPrice: distributorSkus.homeownerPrice,
    listPrice: distributorSkus.listPrice,
    styleCode: doorStyles.styleCode,
  })
  .from(distributorSkus)
  .leftJoin(doorStyles, eq(distributorSkus.styleId, doorStyles.id))
  .where(eq(distributorSkus.distributorId, 3))
  .limit(5);
  console.log("Sample SKUs:", JSON.stringify(samples, null, 2));
  
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
