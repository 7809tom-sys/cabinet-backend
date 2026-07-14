import { getDb } from "./server/db";
import { doorStyles, distributorSkus } from "./drizzle/schema";
import { eq, isNotNull, and } from "drizzle-orm";

async function main() {
  const db = await getDb();
  if (!db) { process.exit(1); }
  
  // Sample SKUs with prices - using raw query to avoid the join issue
  const rows = await db.select({
    masterCode: distributorSkus.masterCode,
    homeownerPrice: distributorSkus.homeownerPrice,
    listPrice: distributorSkus.listPrice,
    yourCost: distributorSkus.yourCost,
    styleId: distributorSkus.styleId,
  })
  .from(distributorSkus)
  .where(and(eq(distributorSkus.distributorId, 3), isNotNull(distributorSkus.homeownerPrice)))
  .limit(5);
  
  for (const r of rows) {
    console.log(`${r.masterCode} | styleId=${r.styleId} | list=$${r.listPrice} | cost=$${r.yourCost} | homeowner=$${r.homeownerPrice}`);
  }
  
  // Check what style codes are linked
  const styleRows = await db.select({ id: doorStyles.id, code: doorStyles.styleCode, name: doorStyles.ourName })
    .from(doorStyles)
    .where(eq(doorStyles.distributorId, 3))
    .limit(10);
  console.log("\nDoor styles for distributor 3:", styleRows.map(s => `${s.id}:${s.code}=${s.name}`).join(", "));
  
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
