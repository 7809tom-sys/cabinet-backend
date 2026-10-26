import { db } from "./server/db";
import { distributors, doorStyles, distributorSkus } from "./drizzle/schema";
import { eq, count, sql } from "drizzle-orm";

async function main() {
  // Check distributor id=3
  const dist = await db.select().from(distributors).where(eq(distributors.id, 3));
  console.log("Distributor 3:", dist[0]);
  
  // Count SKUs
  const skuCount = await db.select({ total: count() }).from(distributorSkus).where(eq(distributorSkus.distributorId, 3));
  console.log("Total SKUs for distributor 3:", skuCount[0].total);
  
  // Sample
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
  console.log("Sample SKUs:", samples);
  
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
