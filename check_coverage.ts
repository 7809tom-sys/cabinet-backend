import { getDb } from "./server/db";
import { sql } from "drizzle-orm";

async function main() {
  const db = await getDb();
  if (!db) { process.exit(1); }

  const total = await db.execute(sql`SELECT COUNT(*) as cnt FROM distributor_skus WHERE distributorId = 3`);
  console.log("Total Skyline SKUs:", (total[0] as any[])[0].cnt);

  const missing = await db.execute(sql`SELECT COUNT(*) as cnt FROM distributor_skus WHERE distributorId = 3 AND (listPrice IS NULL OR listPrice = 0)`);
  console.log("SKUs with no listPrice:", (missing[0] as any[])[0].cnt);

  const noCost = await db.execute(sql`SELECT COUNT(*) as cnt FROM distributor_skus WHERE distributorId = 3 AND (yourCost IS NULL OR yourCost = 0)`);
  console.log("SKUs with no yourCost:", (noCost[0] as any[])[0].cnt);

  const samples = await db.execute(sql`SELECT platformSku, listPrice, yourCost FROM distributor_skus WHERE distributorId = 3 AND (listPrice IS NULL OR listPrice = 0) LIMIT 10`);
  console.log("\nSample missing-price SKUs:");
  for (const r of (samples[0] as any[])) {
    console.log(`  ${r.platformSku}: list=${r.listPrice}, cost=${r.yourCost}`);
  }

  const catalogLinked = await db.execute(sql`SELECT COUNT(DISTINCT ds.masterCabinetId) as cnt FROM distributor_skus ds WHERE ds.distributorId = 3 AND ds.masterCabinetId IS NOT NULL`);
  console.log("\nCabinets linked to Skyline SKUs:", (catalogLinked[0] as any[])[0].cnt);

  const totalCabs = await db.execute(sql`SELECT COUNT(*) as cnt FROM cabinets`);
  console.log("Total cabinets in catalog:", (totalCabs[0] as any[])[0].cnt);

  // Check how many cabinets have NO Skyline SKU linked
  const unlinked = await db.execute(sql`
    SELECT c.masterCode, c.categoryName FROM cabinets c
    WHERE NOT EXISTS (SELECT 1 FROM distributor_skus ds WHERE ds.masterCabinetId = c.id AND ds.distributorId = 3)
    LIMIT 10
  `);
  console.log("\nCabinets with NO Skyline SKU (first 10):");
  for (const r of (unlinked[0] as any[])) {
    console.log(`  ${r.masterCode}: ${r.categoryName}`);
  }

  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
