import { createConnection } from 'mysql2/promise';

const conn = await createConnection(process.env.DATABASE_URL);

// Get all Skyline styles
const [styles] = await conn.execute(
  `SELECT id, styleCode FROM door_styles WHERE distributorId = 3 AND isActive = 1 ORDER BY styleCode`
);
console.log(`Skyline has ${styles.length} active door styles\n`);

// Get all Skyline trim items with their style coverage
const [rows] = await conn.execute(`
  SELECT c.masterCode, c.description, c.subCategory, 
         COUNT(ds.id) as skuCount,
         GROUP_CONCAT(d2.styleCode ORDER BY d2.styleCode) as coveredStyles
  FROM cabinets c
  JOIN distributor_skus ds ON ds.cabinetId = c.id
  JOIN door_styles d2 ON d2.id = ds.styleId
  WHERE ds.distributorId = 3
    AND c.category = 'Accessory'
  GROUP BY c.id
  ORDER BY COUNT(ds.id) ASC, c.masterCode
`);

console.log('Skyline trim items by style coverage:\n');
console.log('Items with PARTIAL coverage (not all 32 styles):');
const partial = rows.filter(r => r.skuCount < styles.length);
partial.forEach(r => {
  console.log(`  ${r.masterCode} (${r.skuCount}/${styles.length} styles) - ${r.description}`);
  console.log(`    Styles: ${r.coveredStyles}`);
});

console.log(`\nItems with FULL coverage (all ${styles.length} styles): ${rows.length - partial.length}`);
const full = rows.filter(r => r.skuCount >= styles.length);
full.forEach(r => {
  console.log(`  ${r.masterCode} - ${r.description}`);
});

// Now check what Skyline catalog items might be missing
// Look at what UCD has that Skyline doesn't
const [ucdOnly] = await conn.execute(`
  SELECT c.masterCode, c.description, c.subCategory
  FROM cabinets c
  JOIN distributor_skus ds ON ds.cabinetId = c.id
  WHERE ds.distributorId = 1
    AND c.category = 'Accessory'
    AND c.id NOT IN (
      SELECT ds2.cabinetId FROM distributor_skus ds2 WHERE ds2.distributorId = 3
    )
  GROUP BY c.id
  ORDER BY c.subCategory, c.masterCode
`);

console.log(`\n\nTrim items in UCD but NOT in Skyline (${ucdOnly.length}):`);
ucdOnly.forEach(r => {
  console.log(`  ${r.masterCode} - ${r.description} [${r.subCategory}]`);
});

// Check Clark & Son items not in Skyline
const [csOnly] = await conn.execute(`
  SELECT c.masterCode, c.description, c.subCategory
  FROM cabinets c
  JOIN distributor_skus ds ON ds.cabinetId = c.id
  WHERE ds.distributorId = 2
    AND c.category = 'Accessory'
    AND c.id NOT IN (
      SELECT ds2.cabinetId FROM distributor_skus ds2 WHERE ds2.distributorId = 3
    )
  GROUP BY c.id
  ORDER BY c.subCategory, c.masterCode
`);

console.log(`\nTrim items in Clark & Son but NOT in Skyline (${csOnly.length}):`);
csOnly.forEach(r => {
  console.log(`  ${r.masterCode} - ${r.description} [${r.subCategory}]`);
});

await conn.end();
process.exit(0);
