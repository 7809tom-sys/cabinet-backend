import mysql from 'mysql2/promise';
const db = await mysql.createConnection(process.env.DATABASE_URL);

// Get all duplicate masterCodes
const [dups] = await db.execute(`
  SELECT masterCode, MIN(id) as keepId, MAX(id) as deleteId, COUNT(*) as cnt 
  FROM cabinets 
  GROUP BY masterCode 
  HAVING cnt > 1
`);

console.log(`Found ${dups.length} duplicate masterCodes to fix`);

let fixed = 0;
for (const dup of dups) {
  // Before deleting the duplicate cabinet, reassign any distributor_skus that reference the duplicate id
  // to point to the one we're keeping
  const [skuUpdate] = await db.execute(
    `UPDATE distributor_skus SET cabinetId = ? WHERE cabinetId = ?`,
    [dup.keepId, dup.deleteId]
  );
  
  // Also reassign any other references (design_placements, etc.)
  await db.execute(
    `UPDATE design_placements SET cabinetId = ? WHERE cabinetId = ? LIMIT 1000`,
    [dup.keepId, dup.deleteId]
  ).catch(() => {}); // ignore if table doesn't exist

  // Delete the duplicate cabinet record
  const [del] = await db.execute(
    `DELETE FROM cabinets WHERE id = ?`,
    [dup.deleteId]
  );
  
  if (del.affectedRows > 0) {
    fixed++;
    console.log(`Fixed: ${dup.masterCode} (kept id=${dup.keepId}, deleted id=${dup.deleteId}, moved ${skuUpdate.affectedRows} SKUs)`);
  }
}

console.log(`\n=== DONE: Fixed ${fixed} duplicates ===`);

// Verify
const [[remaining]] = await db.execute(`
  SELECT COUNT(*) as cnt FROM (
    SELECT masterCode FROM cabinets GROUP BY masterCode HAVING COUNT(*) > 1
  ) t
`);
console.log(`Remaining duplicates: ${remaining.cnt}`);

const [[total]] = await db.execute('SELECT COUNT(*) as cnt FROM cabinets');
console.log(`Total cabinets after dedup: ${total.cnt}`);

await db.end();
