import { getDb } from "./server/db";
import { distributors, doorStyles, distributorSkus } from "./drizzle/schema";
import { eq, count, isNull, isNotNull, and } from "drizzle-orm";

async function main() {
  const db = await getDb();
  if (!db) { process.exit(1); }
  
  // Check price nulls
  const nullPrice = await db.select({ total: count() }).from(distributorSkus)
    .where(and(eq(distributorSkus.distributorId, 3), isNull(distributorSkus.homeownerPrice)));
  const hasPrice = await db.select({ total: count() }).from(distributorSkus)
    .where(and(eq(distributorSkus.distributorId, 3), isNotNull(distributorSkus.homeownerPrice)));
  console.log("Skyline SKUs with NULL homeownerPrice:", nullPrice[0].total);
  console.log("Skyline SKUs with homeownerPrice set:", hasPrice[0].total);
  
  // Check style linkage - how many have a valid styleId
  const nullStyle = await db.select({ total: count() }).from(distributorSkus)
    .where(and(eq(distributorSkus.distributorId, 3), isNull(distributorSkus.styleId)));
  console.log("Skyline SKUs with NULL styleId (unlinked):", nullStyle[0].total);
  
  // Sample with prices
  const samples = await db.select({
    masterCode: distributorSkus.masterCode,
    homeownerPrice: distributorSkus.homeownerPrice,
    listPrice: distributorSkus.listPrice,
    yourCost: distributorSkus.yourCost,
    styleId: distributorSkus.styleId,
  })
  .from(distributorSkus)
  .where(eq(distributorSkus.distributorId, 3))
  .limit(8);
  console.log("Sample SKUs:", JSON.stringify(samples, null, 2));
  
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
