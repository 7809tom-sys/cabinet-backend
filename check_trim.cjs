const mysql = require('mysql2/promise');

async function run() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  // Get all distinct categories/subCategories for USCD SW style
  const [rows] = await conn.query(`
    SELECT DISTINCT c.masterCode, c.category, c.subCategory, c.description, c.placementType
    FROM distributor_skus sku
    JOIN cabinets c ON c.id = sku.cabinetId
    WHERE sku.styleId = 330014 AND sku.isAvailable=1 AND sku.isPublished=1
      AND c.isActive=1 AND c.showInDesigner=1
      AND (c.conflictStatus IS NULL OR c.conflictStatus = 'none')
    ORDER BY c.category, c.subCategory, c.masterCode
    LIMIT 200
  `);

  // Group by category
  const byCat = {};
  for (const r of rows) {
    const k = r.category || 'null';
    if (!byCat[k]) byCat[k] = [];
    byCat[k].push(r.masterCode + ' | sub=' + (r.subCategory||'') + ' | pt=' + (r.placementType||''));
  }
  console.log('USCD SW categories:', JSON.stringify(Object.keys(byCat)));
  for (const [cat, items] of Object.entries(byCat)) {
    console.log(`\n=== ${cat} (${items.length} items) ===`);
    items.slice(0, 10).forEach(i => console.log('  ', i));
    if (items.length > 10) console.log(`  ... and ${items.length - 10} more`);
  }

  // Now check Ashford (Clark & Sons) style ASP = 330001
  const [rows2] = await conn.query(`
    SELECT DISTINCT c.masterCode, c.category, c.subCategory, c.description, c.placementType
    FROM distributor_skus sku
    JOIN cabinets c ON c.id = sku.cabinetId
    WHERE sku.styleId = 330001 AND sku.isAvailable=1 AND sku.isPublished=1
      AND c.isActive=1 AND c.showInDesigner=1
      AND (c.conflictStatus IS NULL OR c.conflictStatus = 'none')
    ORDER BY c.category, c.subCategory, c.masterCode
    LIMIT 200
  `);

  const byCat2 = {};
  for (const r of rows2) {
    const k = r.category || 'null';
    if (!byCat2[k]) byCat2[k] = [];
    byCat2[k].push(r.masterCode + ' | sub=' + (r.subCategory||'') + ' | pt=' + (r.placementType||''));
  }
  console.log('\nAshford ASP categories:', JSON.stringify(Object.keys(byCat2)));
  for (const [cat, items] of Object.entries(byCat2)) {
    console.log(`\n=== Ashford ${cat} (${items.length} items) ===`);
    items.slice(0, 10).forEach(i => console.log('  ', i));
    if (items.length > 10) console.log(`  ... and ${items.length - 10} more`);
  }

  await conn.end();
}
run().catch(console.error);
