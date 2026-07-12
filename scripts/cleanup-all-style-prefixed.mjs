/**
 * cleanup-all-style-prefixed.mjs
 * Removes ALL style-specific cabinet rows from the cabinets table across all categories.
 * 
 * Strategy: a row is "style-specific" if its masterCode starts with a color/style
 * name prefix followed by a hyphen. Generic rows use codes like W1230, B36, ADA-B12, etc.
 * 
 * Known style prefixes (color names used in distributor product lines):
 * - SAGE, IVY, MIST, DOVE, SADDLE, DUNE, HONEY, WHITE, ANTIQUE WHITE, ANTIQUEWHITE
 * - EMBER, ESSENCE OAK, GREY, GRAY, NAVY, BLACK, Cashmere, SU, Unfinished
 * - OC (Oxford Collection), PWB, ESPRESSO, CHARCOAL, CREAM, LINEN
 * 
 * Safe prefixes (NOT style-specific):
 * - ADA- (ADA-compliant cabinet variants)
 * - RS- (roll-out shelves)
 * - B12-, W12- etc. (size-coded variants) -- these start with a letter+number
 */
import mysql from 'mysql2/promise';

// These are known style/color prefixes that appear before a hyphen in masterCodes
// They indicate the row is style-specific and should be deleted.
const STYLE_PREFIXES_TO_DELETE = [
  'SAGE', 'IVY', 'MIST', 'DOVE', 'SADDLE', 'DUNE',
  'Unfinished', 'HONEY', 'WHITE', 'ANTIQUE WHITE', 'ANTIQUEWHITE',
  'EMBER', 'ESSENCE OAK', 'GREY', 'GRAY', 'NAVY',
  'BLACK', 'Cashmere', 'SU', 'OC', 'PWB',
  'ESPRESSO', 'CHARCOAL', 'CREAM', 'LINEN',
  'MAPLE', 'WALNUT', 'OAK', 'HICKORY',
  'BLUE', 'GREEN', 'TEAL', 'RUSTIC', 'NATURAL',
  'STAIN', 'CHERRY', 'BIRCH', 'PINE',
];

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  console.log('=== Cabinet Style-Prefixed Row Cleanup ===\n');

  // Step 1: Show current state
  const [before] = await conn.execute(
    `SELECT category, COUNT(*) as cnt FROM cabinets WHERE isActive=1 GROUP BY category ORDER BY cnt DESC`
  );
  console.log('BEFORE cleanup:');
  let totalBefore = 0;
  before.forEach(r => { console.log(`  ${r.category}: ${r.cnt}`); totalBefore += r.cnt; });
  console.log(`  TOTAL: ${totalBefore}\n`);

  // Step 2: Build the WHERE condition for style-prefixed rows
  // Match: masterCode starts with STYLE_PREFIX + '-' (case-insensitive)
  const conditions = STYLE_PREFIXES_TO_DELETE.map(p => 
    `LOWER(masterCode) LIKE '${p.toLowerCase().replace(/'/g, "''")}-%%'`
  ).join(' OR ');

  // Count what will be deleted per category
  const [toDelete] = await conn.execute(
    `SELECT category, COUNT(*) as cnt FROM cabinets WHERE isActive=1 AND (${conditions}) GROUP BY category ORDER BY cnt DESC`
  );
  console.log('Rows to delete by category:');
  let totalToDelete = 0;
  toDelete.forEach(r => { console.log(`  ${r.category}: ${r.cnt}`); totalToDelete += r.cnt; });
  console.log(`  TOTAL to delete: ${totalToDelete}\n`);

  if (totalToDelete === 0) {
    console.log('Nothing to delete. Already clean!');
    await conn.end();
    return;
  }

  // Step 3: Delete them
  const [deleteResult] = await conn.execute(
    `DELETE FROM cabinets WHERE isActive=1 AND (${conditions})`
  );
  console.log(`✓ Deleted ${deleteResult.affectedRows} style-prefixed rows\n`);

  // Step 4: Merge "Accessories" into "Accessory" for consistency
  const [[accCount]] = await conn.execute(
    `SELECT COUNT(*) as cnt FROM cabinets WHERE isActive=1 AND category='Accessories'`
  );
  if (accCount.cnt > 0) {
    await conn.execute(
      `UPDATE cabinets SET category='Accessory' WHERE isActive=1 AND category='Accessories'`
    );
    console.log(`✓ Merged ${accCount.cnt} rows from 'Accessories' → 'Accessory'\n`);
  }

  // Step 5: Show final state
  const [after] = await conn.execute(
    `SELECT category, COUNT(*) as cnt FROM cabinets WHERE isActive=1 GROUP BY category ORDER BY cnt DESC`
  );
  console.log('AFTER cleanup:');
  let totalAfter = 0;
  after.forEach(r => { console.log(`  ${r.category}: ${r.cnt}`); totalAfter += r.cnt; });
  console.log(`  TOTAL: ${totalAfter}`);
  console.log(`\nRemoved ${totalBefore - totalAfter} rows total.`);

  await conn.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
