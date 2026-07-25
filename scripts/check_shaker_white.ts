import { getDb } from "../server/db";
import { doorStyles, distributors, distributorSkus } from "../drizzle/schema";
import { eq, like, or, sql } from "drizzle-orm";

const db = await getDb();
if (!db) { console.error("No DB"); process.exit(1); }

// Get all door styles with their distributor name and SKU count
const rows = await db
  .select({
    id: doorStyles.id,
    ourName: doorStyles.ourName,
    styleCode: doorStyles.styleCode,
    distributorName: doorStyles.distributorName,
    distributorId: doorStyles.distributorId,
    isActive: doorStyles.isActive,
    distName: distributors.name,
    distCode: distributors.code,
    skuCount: sql<number>`(SELECT COUNT(*) FROM distributor_skus WHERE styleId = ${doorStyles.id})`,
  })
  .from(doorStyles)
  .leftJoin(distributors, eq(distributors.id, doorStyles.distributorId))
  .where(
    or(
      like(doorStyles.ourName, "%Shaker White%"),
      like(doorStyles.ourName, "%White Shaker%"),
      like(doorStyles.distributorName, "%Shaker White%"),
      like(doorStyles.distributorName, "%White Shaker%"),
      eq(doorStyles.styleCode, "SW"),
    )
  )
  .orderBy(doorStyles.ourName, doorStyles.id);

console.log("=== Shaker White styles ===");
for (const r of rows) {
  console.log(`ID=${r.id} | ourName="${r.ourName}" | styleCode="${r.styleCode}" | distId=${r.distributorId} | distCode=${r.distCode} | distName="${r.distName}" | skuCount=${r.skuCount} | active=${r.isActive}`);
}

// Also show ALL UCD styles
const ucdRows = await db
  .select({
    id: doorStyles.id,
    ourName: doorStyles.ourName,
    styleCode: doorStyles.styleCode,
    distributorName: doorStyles.distributorName,
    distCode: distributors.code,
    skuCount: sql<number>`(SELECT COUNT(*) FROM distributor_skus WHERE styleId = ${doorStyles.id})`,
  })
  .from(doorStyles)
  .leftJoin(distributors, eq(distributors.id, doorStyles.distributorId))
  .where(eq(distributors.code, "UCD"))
  .orderBy(doorStyles.ourName);

console.log("\n=== All UCD styles ===");
for (const r of ucdRows) {
  console.log(`ID=${r.id} | ourName="${r.ourName}" | styleCode="${r.styleCode}" | distCode=${r.distCode} | skuCount=${r.skuCount}`);
}

// Also show styles with NO distributor (distributorId = 0 or null-ish)
const noDistRows = await db
  .select({
    id: doorStyles.id,
    ourName: doorStyles.ourName,
    styleCode: doorStyles.styleCode,
    distributorId: doorStyles.distributorId,
    skuCount: sql<number>`(SELECT COUNT(*) FROM distributor_skus WHERE styleId = ${doorStyles.id})`,
  })
  .from(doorStyles)
  .where(
    or(
      like(doorStyles.ourName, "%Shaker White%"),
      like(doorStyles.ourName, "%White Shaker%"),
    )
  )
  .orderBy(doorStyles.ourName);

console.log("\n=== All styles matching Shaker White (any distributor) ===");
for (const r of noDistRows) {
  console.log(`ID=${r.id} | ourName="${r.ourName}" | styleCode="${r.styleCode}" | distributorId=${r.distributorId} | skuCount=${r.skuCount}`);
}

process.exit(0);
