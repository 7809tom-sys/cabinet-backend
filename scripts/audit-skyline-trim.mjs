import { createConnection } from 'mysql2/promise';

const conn = await createConnection(process.env.DATABASE_URL);

// Count total Skyline trim items
const [rows] = await conn.execute(`
  SELECT c.masterCode, c.description, c.subCategory, c.catalogImageUrl
  FROM cabinets c
  JOIN distributor_skus ds ON ds.cabinetId = c.id
  WHERE ds.distributorId = 3
    AND c.category = 'Accessory'
  GROUP BY c.id
  ORDER BY c.subCategory, c.masterCode
`);

console.log('Total Skyline trim items: ' + rows.length);
console.log('\nBy sub-category:');
const bySub = {};
rows.forEach(r => {
  const key = r.subCategory || 'Uncategorized';
  if (!bySub[key]) bySub[key] = [];
  bySub[key].push(r.masterCode);
});
Object.entries(bySub).forEach(([cat, codes]) => {
  console.log(`  ${cat} (${codes.length}): ${codes.join(', ')}`);
});

// Items WITHOUT photos
const noPhoto = rows.filter(r => !r.catalogImageUrl);
console.log('\nItems without photos: ' + noPhoto.length);
if (noPhoto.length > 0) {
  noPhoto.forEach(r => console.log(`  ${r.masterCode} - ${r.description}`));
}

// Items WITH photos
const withPhoto = rows.filter(r => r.catalogImageUrl);
console.log('\nItems with photos: ' + withPhoto.length);
withPhoto.forEach(r => console.log(`  ${r.masterCode} -> ${r.catalogImageUrl}`));

// Now get the Skyline-specific SKU details to see what distributor codes they use
const [skuDetails] = await conn.execute(`
  SELECT c.masterCode, ds.distributorSku, ds.listPrice,
         d2.styleCode
  FROM cabinets c
  JOIN distributor_skus ds ON ds.cabinetId = c.id
  JOIN door_styles d2 ON d2.id = ds.styleId
  WHERE ds.distributorId = 3
    AND c.category = 'Accessory'
    AND d2.styleCode = 'SW'
  ORDER BY c.masterCode
`);

console.log('\n\nSkyline trim SKUs (SW style only, ' + skuDetails.length + ' items):');
skuDetails.forEach(r => {
  console.log(`  ${r.masterCode} -> distSku: ${r.distributorSku}, listPrice: $${r.listPrice}`);
});

await conn.end();
process.exit(0);
