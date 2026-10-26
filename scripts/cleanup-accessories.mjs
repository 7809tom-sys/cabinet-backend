/**
 * cleanup-accessories.mjs
 * Deletes style-specific accessory rows from the cabinets table.
 * These are rows whose masterCode starts with a color/style name prefix
 * (e.g. "ANTIQUE WHITE-F342", "Cashmere-10SWATCH", "SAGE-F342").
 * 
 * Run: node scripts/cleanup-accessories.mjs
 */
import mysql from 'mysql2/promise';

const STYLE_PREFIXES = [
  // Color-based prefixes used in accessory masterCodes
  'SAGE', 'IVY', 'MIST', 'DOVE', 'SADDLE', 'DUNE',
  'HONEY', 'WHITE', 'ANTIQUE WHITE', 'ANTIQUEWHITE',
  'EMBER', 'ESSENCE OAK', 'GREY', 'GRAY', 'NAVY',
  'BLACK', 'Cashmere', 'SU', 'Unfinished',
  // Oxford Collection prefix
  'OC',
  // Additional known style prefixes
  'ESPRESSO', 'CHARCOAL', 'CREAM', 'LINEN',
  'MAPLE', 'WALNUT', 'OAK', 'HICKORY',
  'BLUE', 'GREEN', 'SAGE', 'TEAL',
  'RUSTIC', 'NATURAL', 'STAIN',
];

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  // Step 1: Get all unique prefixes from Accessory/Accessories rows with hyphens
  const [prefixRows] = await conn.execute(`
    SELECT DISTINCT SUBSTRING_INDEX(masterCode, '-', 1) as prefix, COUNT(*) as cnt
    FROM cabinets 
    WHERE isActive=1 AND category IN ('Accessory','Accessories') AND masterCode LIKE '%-%'
    GROUP BY prefix 
    ORDER BY cnt DESC
  `);
  
  console.log('\nAll prefixes found in Accessory/Accessories:');
  prefixRows.forEach(r => console.log(`  "${r.prefix}": ${r.cnt} rows`));

  // Step 2: Identify which prefixes are style-specific (not generic accessory codes)
  // Generic accessory codes that contain hyphens are: RS18-TYPEA, RS21-TYPEA, etc.
  // Everything else with a multi-word or color-name prefix is style-specific.
  const genericPrefixes = new Set(['RS18', 'RS21', 'RS24', 'RS27', 'RS30', 'RS33', 'RS36', 'RS39', 'RS42']);
  const stylePrefixes = prefixRows
    .filter(r => !genericPrefixes.has(r.prefix))
    .map(r => r.prefix);
  
  console.log('\nStyle prefixes to delete:', stylePrefixes);

  // Step 3: Count rows to delete
  const conditions = stylePrefixes.map(p => `LOWER(masterCode) LIKE '${p.toLowerCase().replace(/'/g, "''")}-%'`).join(' OR ');
  const [[countResult]] = await conn.execute(
    `SELECT COUNT(*) as cnt FROM cabinets WHERE isActive=1 AND category IN ('Accessory','Accessories') AND (${conditions})`
  );
  console.log(`\nRows to delete: ${countResult.cnt}`);

  // Step 4: Delete them
  const [deleteResult] = await conn.execute(
    `DELETE FROM cabinets WHERE isActive=1 AND category IN ('Accessory','Accessories') AND (${conditions})`
  );
  console.log(`Deleted: ${deleteResult.affectedRows} rows`);

  // Step 5: Handle RS duplicates (TYPEA vs TypeA - keep lowercase TypeA, delete TYPEA)
  const [[rsDups]] = await conn.execute(
    `SELECT COUNT(*) as cnt FROM cabinets WHERE isActive=1 AND masterCode LIKE 'RS%-TYPEA'`
  );
  console.log(`\nRS-TYPEA duplicates to remove: ${rsDups.cnt}`);
  if (rsDups.cnt > 0) {
    const [rsDelete] = await conn.execute(
      `DELETE FROM cabinets WHERE isActive=1 AND masterCode LIKE 'RS%-TYPEA'`
    );
    console.log(`Deleted RS-TYPEA duplicates: ${rsDelete.affectedRows}`);
  }

  // Step 6: Final counts
  const [finalCounts] = await conn.execute(
    `SELECT category, COUNT(*) as cnt FROM cabinets WHERE isActive=1 GROUP BY category ORDER BY cnt DESC`
  );
  console.log('\nFinal counts by category:');
  let total = 0;
  finalCounts.forEach(r => { console.log(`  ${r.category}: ${r.cnt}`); total += r.cnt; });
  console.log(`  TOTAL: ${total}`);

  await conn.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
