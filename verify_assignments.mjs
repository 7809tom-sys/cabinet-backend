import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const DIST = { madison: 1, ashford: 2, preston: 3 };
const DIST_NAMES = { 1: 'Madison', 2: 'Ashford', 3: 'Preston' };

// Authoritative mapping from the spreadsheet
const authoritative = [
  // Ashford (Clark and Son) — distId=2
  { distId: DIST.ashford, codes: ['ASP','CC','CS','RH','DN','GV','FS','HS','MBS','NG','PS','WPG','WS'] },
  // Preston (Skyline) — distId=3
  { distId: DIST.preston, codes: ['SW','GR','SE','NB','AG','IB','SA','LG','SB','TC','RW','AW','AC','DSG','DDW','CW','SDW','SAG','SIB','SAO','SWO','HW','HG','MB','MI','OB','OS','CG','MG','FW','FG','FE'] },
  // Madison (US Cabinet Depot) — distId=1
  { distId: DIST.madison, codes: ['SA','SD','SG','SW','SI','SN','SB','SH','SC','EW','OW','OS','CW','CS','HD','OM','OT','HE','SEO','SU','OC'] },
];

// Get all door styles with SKUs
const [styles] = await conn.query(`
  SELECT ds.id, ds.styleCode, ds.ourName, ds.distributorId,
    COUNT(dsk.id) as skuCount
  FROM door_styles ds
  LEFT JOIN distributor_skus dsk ON dsk.styleId = ds.id
  GROUP BY ds.id, ds.styleCode, ds.ourName, ds.distributorId
  HAVING COUNT(dsk.id) > 0
  ORDER BY ds.distributorId, ds.styleCode
`);

console.log('=== Verification: Door Style Assignments ===\n');

let issues = 0;
const byDist = { 1: [], 2: [], 3: [] };

for (const style of styles) {
  const { id, styleCode, ourName, distributorId, skuCount } = style;
  
  // Find which distributor this styleCode should belong to
  // A styleCode can appear in multiple distributors (e.g., SW in both Preston and Madison)
  // We verify by checking if the assigned distributor legitimately owns this code
  const legitimateOwners = authoritative
    .filter(({ codes }) => codes.includes(styleCode))
    .map(({ distId }) => distId);
  
  const isCorrect = legitimateOwners.includes(distributorId);
  
  if (byDist[distributorId]) {
    byDist[distributorId].push({ styleCode, ourName, skuCount, isCorrect, legitimateOwners });
  }
  
  if (!isCorrect) {
    console.log(`❌ WRONG: "${ourName}" (${styleCode}) assigned to ${DIST_NAMES[distributorId]}, should be in ${legitimateOwners.map(d => DIST_NAMES[d]).join(' or ')}`);
    issues++;
  }
}

console.log('\n--- Ashford (Clark and Son) styles ---');
for (const s of byDist[2]) {
  console.log(`  ${s.isCorrect ? '✓' : '❌'} ${s.styleCode} | ${s.ourName} | ${s.skuCount} SKUs`);
}

console.log('\n--- Preston (Skyline) styles ---');
for (const s of byDist[3]) {
  console.log(`  ${s.isCorrect ? '✓' : '❌'} ${s.styleCode} | ${s.ourName} | ${s.skuCount} SKUs`);
}

console.log('\n--- Madison (US Cabinet Depot) styles ---');
for (const s of byDist[1]) {
  console.log(`  ${s.isCorrect ? '✓' : '❌'} ${s.styleCode} | ${s.ourName} | ${s.skuCount} SKUs`);
}

console.log(`\n=== Total issues: ${issues} ===`);
console.log(`Total styles with SKUs: ${styles.length}`);

// Also check for any remaining multi-distributor conflicts
const [conflicts] = await conn.query(`
  SELECT ds.ourName, ds.styleCode,
    GROUP_CONCAT(DISTINCT dsk.distributorId) as distIds,
    COUNT(DISTINCT dsk.distributorId) as distCount
  FROM distributor_skus dsk
  JOIN door_styles ds ON ds.id = dsk.styleId
  GROUP BY dsk.styleId
  HAVING COUNT(DISTINCT dsk.distributorId) > 1
`);
console.log(`Multi-distributor conflicts: ${conflicts.length}`);

await conn.end();
