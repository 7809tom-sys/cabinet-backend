/**
 * Merge ghost style 300001 (Skyline SKUs with distId=1) into proper Skyline style 390001.
 * 
 * Steps:
 * 1. Check for conflicts (same cabinetId+distributorId already in 390001)
 * 2. Delete any conflicting rows from 300001 (the ghost has dupes)
 * 3. Update remaining rows: set styleId=390001, distributorId=180001 (Skyline)
 * 4. Delete the ghost door_style row 300001
 */
import { getDb } from "../server/db";
import { sql } from "drizzle-orm";

const db = await getDb();
if (!db) { console.error("No DB"); process.exit(1); }

// Step 1: Find conflicts
const [conflicts] = await db.execute(sql`
  SELECT a.id as oldId, a.cabinetId, a.platformSku as oldPlatform, b.platformSku as existingPlatform
  FROM distributor_skus a
  JOIN distributor_skus b 
    ON b.cabinetId = a.cabinetId 
    AND b.distributorId = 180001
    AND b.styleId = 390001
  WHERE a.styleId = 300001
`);
const conflictRows = conflicts as any[];
console.log(`Found ${conflictRows.length} conflicts (already exist in Skyline style 390001):`);
for (const r of conflictRows) {
  console.log(`  ghostId=${r.oldId} | cabinetId=${r.cabinetId} | ghost="${r.oldPlatform}" | existing="${r.existingPlatform}"`);
}

if (conflictRows.length > 0) {
  // Delete conflicting ghost rows (the proper Skyline ones already exist)
  const conflictIds = conflictRows.map((r: any) => r.oldId);
  await db.execute(sql`
    DELETE FROM distributor_skus WHERE id IN (${sql.raw(conflictIds.join(','))}) AND styleId = 300001
  `);
  console.log(`Deleted ${conflictIds.length} conflicting ghost rows.`);
}

// Step 2: Count remaining rows to migrate
const [countRes] = await db.execute(sql`SELECT COUNT(*) as cnt FROM distributor_skus WHERE styleId = 300001`);
const remaining = (countRes as any[])[0]?.cnt ?? 0;
console.log(`\nRemaining rows to migrate: ${remaining}`);

// Step 3: Reassign styleId and distributorId
await db.execute(sql`
  UPDATE distributor_skus 
  SET styleId = 390001, distributorId = 180001
  WHERE styleId = 300001
`);
console.log(`Updated all remaining rows: styleId → 390001, distributorId → 180001`);

// Step 4: Verify
const [afterCount] = await db.execute(sql`SELECT COUNT(*) as cnt FROM distributor_skus WHERE styleId = 300001`);
const leftover = (afterCount as any[])[0]?.cnt ?? 0;
console.log(`Rows still in ghost style 300001: ${leftover}`);

if (leftover === 0) {
  // Step 5: Delete the ghost door_style row
  await db.execute(sql`DELETE FROM door_styles WHERE id = 300001`);
  console.log(`Deleted ghost door_style row 300001.`);
} else {
  console.log(`WARNING: ${leftover} rows still in ghost style — NOT deleting door_style row.`);
}

// Final count in Skyline style 390001
const [finalCount] = await db.execute(sql`SELECT COUNT(*) as cnt FROM distributor_skus WHERE styleId = 390001`);
console.log(`\nSkyline style 390001 now has ${(finalCount as any[])[0]?.cnt} SKUs.`);

process.exit(0);
