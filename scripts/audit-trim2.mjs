import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Get ALL items that might be trim/accessories/fillers/panels
const [rows] = await conn.execute(`
  SELECT c.masterCode, c.description, c.category, c.subCategory, c.catalogImageUrl
  FROM cabinets c
  WHERE c.category = 'Accessory' OR c.category = 'Accessories'
     OR c.subCategory LIKE '%Trim%'
     OR c.subCategory LIKE '%Molding%'
     OR c.subCategory LIKE '%Filler%'
     OR c.subCategory LIKE '%Panel%'
     OR c.subCategory LIKE '%Crown%'
     OR c.subCategory LIKE '%Skin%'
     OR c.subCategory LIKE '%End Panel%'
     OR c.subCategory LIKE '%Decorative%'
     OR c.subCategory LIKE '%Shelf%'
     OR c.subCategory LIKE '%Valance%'
     OR c.subCategory LIKE '%Accent%'
  ORDER BY c.category, c.subCategory, c.masterCode
`);

console.log('Total accessory/trim items:', rows.length);
const bySubCat = {};
for (const r of rows) {
  const key = r.subCategory || 'null';
  if (!bySubCat[key]) bySubCat[key] = [];
  bySubCat[key].push(r);
}
for (const [sub, items] of Object.entries(bySubCat).sort()) {
  console.log(`\n[${sub}] (${items.length} items)`);
  for (const i of items) {
    console.log(`  ${i.masterCode} | ${i.catalogImageUrl ? 'HAS_PHOTO' : 'NO_PHOTO'} | ${(i.description || '').substring(0, 50)}`);
  }
}

// Now check what the UCD catalog PDF lists that we DON'T have
// From pages 9-11 of uscabinetdepot.pdf, these are the trim codes:
const ucdTrimCodes = [
  // Crown Moldings (page 9)
  'ACM8', 'LACM8', 'COV', 'CMB', 'DCM', 'KCM', 'ROPE',
  // Light Rail (page 9)
  'ALRM', 'LRM',
  // Trim Moldings (page 9)
  'OCM', 'BAM', 'SCR', 'SHM',
  // Toe Kick (page 10)
  'TKC', 'FBM', 'FBMS',
  // Fillers (page 10)
  'F342', 'F396', 'F642', 'F696',
  // Decorative Filler Overlays (page 10)
  'FOL630', 'FOL636', 'FOL642',
  // Skin Panels (page 10)
  'BSV', 'WSV42', 'USV2496', 'FPV4296', 'BBFPV4296',
  // Dishwasher Return Panel (page 10)
  'DWR3',
  // Refrigerator End Panels (page 10)
  'REPV3096', 'REPVKIT',
  // Decorative End Panels (page 10)
  'BDEP', 'WDEP1212', 'WDEP1215', 'WDEP1218', 'WDEP30', 'WDEP36', 'WDEF42',
  'TDEP2484', 'TDEP2490', 'TDEP2496', 'VDEP',
  // Finished Shelf Board (page 10)
  'S2496', 'S3696',
  // Accent Accessories (pages 10-11)
  'MCB', 'CBT', 'CDL', 'SCDL', 'VASH48',
  // Touch Up Kit (page 11)
  'TUK',
];

// Check which UCD codes exist in our DB
const masterCodes = rows.map(r => r.masterCode);
console.log('\n\n========== UCD CATALOG TRIM CODES vs DATABASE ==========\n');
const missing = [];
const present = [];
for (const code of ucdTrimCodes) {
  // Check exact match or close match
  const exact = masterCodes.find(m => m === code || m.replace(/-/g, '') === code);
  if (exact) {
    present.push({ code, dbCode: exact });
  } else {
    // Try partial match
    const partial = masterCodes.find(m => m.startsWith(code) || code.startsWith(m.replace(/-/g, '')));
    if (partial) {
      present.push({ code, dbCode: partial, partial: true });
    } else {
      missing.push(code);
    }
  }
}

console.log(`PRESENT in DB (${present.length}):`);
for (const p of present) {
  const suffix = p.partial ? ` (partial match: ${p.dbCode})` : ` (exact: ${p.dbCode})`;
  console.log(`  ${p.code}${suffix}`);
}

console.log(`\nMISSING from DB (${missing.length}):`);
for (const m of missing) {
  console.log(`  ${m}`);
}

await conn.end();
