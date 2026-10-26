import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Get all trim/accessory/panel/filler/molding items
const [rows] = await conn.execute(`
  SELECT DISTINCT c.id, c.masterCode, c.description, c.category, c.subCategory, 
         c.catalogImageUrl, c.width, c.height, c.depth
  FROM cabinets c
  WHERE c.category IN ('Accessories', 'Trim', 'Molding', 'Panel')
     OR c.subCategory LIKE '%trim%'
     OR c.subCategory LIKE '%molding%'
     OR c.subCategory LIKE '%filler%'
     OR c.subCategory LIKE '%panel%'
     OR c.subCategory LIKE '%crown%'
     OR c.masterCode LIKE 'CM%'
     OR c.masterCode LIKE 'LR%'
     OR c.masterCode LIKE 'TK%'
     OR c.masterCode LIKE 'SC%'
     OR c.masterCode LIKE 'VA%'
     OR c.masterCode LIKE 'FP%'
     OR c.masterCode LIKE 'REP%'
     OR c.masterCode LIKE 'BEP%'
     OR c.masterCode LIKE 'DHP%'
  ORDER BY c.masterCode
`);

console.log(`Found ${rows.length} trim/accessory items\n`);

// Group by category/subCategory
const groups = {};
for (const r of rows) {
  const key = `${r.category || 'N/A'} / ${r.subCategory || 'N/A'}`;
  if (!groups[key]) groups[key] = [];
  groups[key].push(r);
}

for (const [group, items] of Object.entries(groups)) {
  console.log(`\n=== ${group} (${items.length} items) ===`);
  for (const item of items) {
    const hasPhoto = item.catalogImageUrl ? '✓ PHOTO' : '✗ NO PHOTO';
    console.log(`  ${item.masterCode} - ${item.description?.substring(0, 60)} [${hasPhoto}]`);
    if (item.catalogImageUrl) console.log(`    Image: ${item.catalogImageUrl}`);
  }
}

// Now check which trim items have distributor_sku entries
const [skuRows] = await conn.execute(`
  SELECT c.masterCode, c.description, c.catalogImageUrl,
         ds.ourName as styleName, ds.color as colorFamily,
         dsk.distributorSku, dsk.listPrice, dsk.imageUrl as skuImageUrl,
         d.name as distributorName
  FROM cabinets c
  JOIN distributor_skus dsk ON dsk.cabinetId = c.id
  JOIN door_styles ds ON ds.id = dsk.styleId
  JOIN distributors d ON d.id = dsk.distributorId
  WHERE (c.category IN ('Accessories', 'Trim', 'Molding', 'Panel')
     OR c.subCategory LIKE '%trim%'
     OR c.subCategory LIKE '%molding%'
     OR c.subCategory LIKE '%filler%'
     OR c.subCategory LIKE '%panel%'
     OR c.subCategory LIKE '%crown%'
     OR c.masterCode LIKE 'CM%'
     OR c.masterCode LIKE 'LR%'
     OR c.masterCode LIKE 'TK%'
     OR c.masterCode LIKE 'SC%'
     OR c.masterCode LIKE 'VA%'
     OR c.masterCode LIKE 'FP%'
     OR c.masterCode LIKE 'REP%'
     OR c.masterCode LIKE 'BEP%'
     OR c.masterCode LIKE 'DHP%')
  ORDER BY c.masterCode, ds.ourName
`);

console.log(`\n\n========== TRIM SKU MAPPINGS (${skuRows.length} entries) ==========\n`);

// Group by masterCode
const byCode = {};
for (const r of skuRows) {
  if (!byCode[r.masterCode]) byCode[r.masterCode] = { desc: r.description, photo: r.catalogImageUrl, styles: [] };
  byCode[r.masterCode].styles.push({ 
    style: r.styleName, 
    color: r.colorFamily, 
    sku: r.distributorSku, 
    dist: r.distributorName, 
    price: r.listPrice,
    skuImage: r.skuImageUrl 
  });
}

for (const [code, data] of Object.entries(byCode)) {
  const hasPhoto = data.photo ? '✓' : '✗';
  console.log(`\n${code} - ${data.desc?.substring(0, 60)} [Catalog Photo: ${hasPhoto}]`);
  if (data.photo) console.log(`  Catalog Image: ${data.photo}`);
  
  // Check if any SKU-level images differ from the catalog image
  const skuImages = [...new Set(data.styles.filter(s => s.skuImage).map(s => s.skuImage))];
  if (skuImages.length > 0) {
    console.log(`  SKU-level images (${skuImages.length} unique):`);
    for (const img of skuImages) console.log(`    → ${img}`);
  }
  
  const uniqueStyles = [...new Set(data.styles.map(s => `${s.style} (${s.dist})`))];
  console.log(`  Available in ${uniqueStyles.length} styles: ${uniqueStyles.join(', ')}`);
}

// Check what trim types the catalogs mention (from the uploaded PDFs we've processed)
// Also check: are there fillers in the system?
const [fillers] = await conn.execute(`
  SELECT c.masterCode, c.description, c.category, c.subCategory, c.catalogImageUrl
  FROM cabinets c
  WHERE c.masterCode LIKE 'BF%' OR c.masterCode LIKE 'WF%' OR c.masterCode LIKE 'TF%'
     OR c.masterCode LIKE 'QUART%' OR c.masterCode LIKE 'QUAF%'
     OR c.description LIKE '%filler%'
  ORDER BY c.masterCode
`);

console.log(`\n\n========== FILLERS (${fillers.length} items) ==========\n`);
for (const f of fillers.slice(0, 30)) {
  const hasPhoto = f.catalogImageUrl ? '✓' : '✗';
  console.log(`  ${f.masterCode} - ${f.description?.substring(0, 50)} [${f.category}/${f.subCategory}] [Photo: ${hasPhoto}]`);
}
if (fillers.length > 30) console.log(`  ... and ${fillers.length - 30} more`);

await conn.end();
