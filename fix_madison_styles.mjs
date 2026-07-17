import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const DIST = { madison: 1, ashford: 2, preston: 3 };
const DIST_NAMES = { 1: 'Madison', 2: 'Ashford', 3: 'Preston' };

// Authoritative Madison styles (exactly 21)
const MADISON_CODES = new Set(['SA','SD','SG','SW','SI','SN','SB','SH','SC','EW','OW','OS','CW','CS','HD','OM','OT','HE','SEO','SU','OC']);

// Authoritative Preston styles (32)
const PRESTON_CODES = new Set(['SW','GR','SE','NB','AG','IB','SA','LG','SB','TC','RW','AW','AC','DSG','DDW','CW','SDW','SAG','SIB','SAO','SWO','HW','HG','MB','MI','OB','OS','CG','MG','FW','FG','FE']);

console.log('=== Identifying extra Madison styles ===\n');

// Get all door styles currently assigned to Madison with their SKU counts
const [madisonStyles] = await conn.query(`
  SELECT ds.id, ds.styleCode, ds.ourName, ds.distributorId,
    COUNT(dsk.id) as skuCount
  FROM door_styles ds
  LEFT JOIN distributor_skus dsk ON dsk.styleId = ds.id AND dsk.distributorId = 1
  WHERE ds.distributorId = 1
  GROUP BY ds.id, ds.styleCode, ds.ourName, ds.distributorId
  ORDER BY ds.styleCode
`);

console.log(`Total Madison styles: ${madisonStyles.length}`);
console.log('\nAll Madison styles:');

const extra = [];
const correct = [];

for (const s of madisonStyles) {
  const isAuthoritative = MADISON_CODES.has(s.styleCode);
  if (isAuthoritative) {
    correct.push(s);
    console.log(`  ✓ ${s.styleCode.padEnd(6)} ${s.ourName.padEnd(35)} ${s.skuCount} SKUs`);
  } else {
    extra.push(s);
    // Determine where it should go
    const shouldBePreston = PRESTON_CODES.has(s.styleCode);
    console.log(`  ❌ ${s.styleCode.padEnd(6)} ${s.ourName.padEnd(35)} ${s.skuCount} SKUs → should be ${shouldBePreston ? 'Preston' : 'UNKNOWN'}`);
  }
}

console.log(`\nCorrect Madison styles: ${correct.length}`);
console.log(`Extra (wrong) styles: ${extra.length}`);

// For each extra style, check if Preston already has a style with the same code
console.log('\n=== Analyzing extra styles ===');
for (const s of extra) {
  const [prestonMatch] = await conn.query(`
    SELECT ds.id, ds.styleCode, ds.ourName, COUNT(dsk.id) as skuCount
    FROM door_styles ds
    LEFT JOIN distributor_skus dsk ON dsk.styleId = ds.id AND dsk.distributorId = 3
    WHERE ds.distributorId = 3 AND ds.styleCode = ?
    GROUP BY ds.id, ds.styleCode, ds.ourName
  `, [s.styleCode]);
  
  if (prestonMatch.length > 0) {
    const pm = prestonMatch[0];
    console.log(`\n${s.styleCode} "${s.ourName}" (Madison, ${s.skuCount} SKUs)`);
    console.log(`  → Preston already has: "${pm.ourName}" (${pm.skuCount} SKUs)`);
    
    if (s.skuCount === 0) {
      console.log(`  → Madison version has 0 SKUs — SAFE TO DELETE or reassign`);
    } else {
      console.log(`  → Madison version has ${s.skuCount} SKUs — need to MOVE to Preston`);
    }
  } else {
    console.log(`\n${s.styleCode} "${s.ourName}" (Madison, ${s.skuCount} SKUs)`);
    console.log(`  → No Preston match found — need to CREATE in Preston or reassign`);
  }
}

await conn.end();
