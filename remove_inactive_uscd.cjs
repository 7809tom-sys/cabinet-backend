"use strict";
/**
 * Remove inactive USCD SKU rows — those whose masterCode has no match in V6 P&A
 * These are old hyphenated codes that were not normalized (no V6 equivalent found)
 */
const mysql = require("mysql2/promise");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  // Load V6 prices to get the set of valid master codes
  const v6 = JSON.parse(fs.readFileSync("/home/ubuntu/uscd_v6_prices.json", "utf8"));
  const validCodes = new Set(v6.map(r => r.sku));

  console.log(`V6 valid master codes: ${validCodes.size}`);

  // Find all USCD cabinets whose masterCode is NOT in V6
  const [unmatchedCabinets] = await conn.execute(`
    SELECT DISTINCT c.id, c.masterCode
    FROM cabinets c
    JOIN distributor_skus ds ON ds.cabinetId = c.id
    WHERE ds.distributorId = 1
    ORDER BY c.masterCode
  `);

  const toRemove = unmatchedCabinets.filter(c => !validCodes.has(c.masterCode));
  const toRemoveIds = toRemove.map(c => c.id);

  console.log(`Total USCD cabinets in DB: ${unmatchedCabinets.length}`);
  console.log(`Cabinets with no V6 match (to remove): ${toRemove.length}`);
  
  if (toRemove.length > 0) {
    console.log("\nSample of codes being removed:");
    toRemove.slice(0, 20).forEach(c => console.log(`  ${c.masterCode} (id=${c.id})`));
    if (toRemove.length > 20) console.log(`  ... and ${toRemove.length - 20} more`);
  }

  if (toRemoveIds.length === 0) {
    console.log("Nothing to remove.");
    await conn.end();
    process.exit(0);
  }

  // Delete distributor_skus rows for these cabinets (USCD only)
  const placeholders = toRemoveIds.map(() => "?").join(",");
  
  const [skuResult] = await conn.execute(
    `DELETE FROM distributor_skus WHERE distributorId = 1 AND cabinetId IN (${placeholders})`,
    toRemoveIds
  );
  console.log(`\nDeleted ${skuResult.affectedRows} distributor_skus rows`);

  // Check if any of these cabinets are used by other distributors before deleting
  const [stillUsed] = await conn.execute(
    `SELECT DISTINCT cabinetId FROM distributor_skus WHERE cabinetId IN (${placeholders})`,
    toRemoveIds
  );
  const stillUsedIds = new Set(stillUsed.map(r => r.cabinetId));
  const safeToDeleteCabinets = toRemoveIds.filter(id => !stillUsedIds.has(id));

  if (safeToDeleteCabinets.length > 0) {
    const cabPlaceholders = safeToDeleteCabinets.map(() => "?").join(",");
    const [cabResult] = await conn.execute(
      `DELETE FROM cabinets WHERE id IN (${cabPlaceholders})`,
      safeToDeleteCabinets
    );
    console.log(`Deleted ${cabResult.affectedRows} cabinet rows (not used by other distributors)`);
  }

  console.log("\nDone! Summary:");
  console.log(`  SKU rows removed: ${skuResult.affectedRows}`);
  console.log(`  Cabinet rows removed: ${safeToDeleteCabinets.length}`);
  console.log(`  Cabinets kept (used by other distributors): ${stillUsedIds.size}`);

  await conn.end();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
