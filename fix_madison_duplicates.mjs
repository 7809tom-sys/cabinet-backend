import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const DIST = { madison: 1, ashford: 2, preston: 3 };
const DIST_NAMES = { 1: 'Madison', 2: 'Ashford', 3: 'Preston' };

// Authoritative Madison styles (exactly 21 codes)
const MADISON_CODES = new Set(['SA','SD','SG','SW','SI','SN','SB','SH','SC','EW','OW','OS','CW','CS','HD','OM','OT','HE','SEO','SU','OC']);

console.log('=== Merging extra Madison styles into correct distributors ===\n');

// Get all extra Madison styles (those with codes not in MADISON_CODES)
const [extraStyles] = await conn.query(`
  SELECT ds.id, ds.styleCode, ds.ourName, ds.distributorId,
    COUNT(dsk.id) as skuCount
  FROM door_styles ds
  LEFT JOIN distributor_skus dsk ON dsk.styleId = ds.id
  WHERE ds.distributorId = 1
  GROUP BY ds.id, ds.styleCode, ds.ourName, ds.distributorId
  ORDER BY ds.styleCode
`);

const extras = extraStyles.filter(s => !MADISON_CODES.has(s.styleCode));
console.log(`Extra Madison styles to fix: ${extras.length}`);

let totalMoved = 0;
let totalDeleted = 0;

for (const extra of extras) {
  console.log(`\nProcessing: ${extra.styleCode} "${extra.ourName}" (id=${extra.id}, ${extra.skuCount} SKUs)`);
  
  // Special case: WS "White Shaker" → should go to Ashford
  if (extra.styleCode === 'WS') {
    // Find Ashford's WS style
    const [ashfordWS] = await conn.query(`
      SELECT id, ourName FROM door_styles 
      WHERE styleCode = 'WS' AND distributorId = 2
      LIMIT 1
    `);
    
    if (ashfordWS.length > 0) {
      const target = ashfordWS[0];
      console.log(`  → Merging into Ashford WS "${target.ourName}" (id=${target.id})`);
      
      // Move all SKUs from this style to the Ashford WS style
      const [moveResult] = await conn.query(`
        UPDATE distributor_skus 
        SET styleId = ?, distributorId = 2
        WHERE styleId = ?
      `, [target.id, extra.id]);
      console.log(`  → Moved ${moveResult.affectedRows} SKUs to Ashford WS`);
      totalMoved += moveResult.affectedRows;
      
      // Delete the Madison WS style record
      await conn.query(`DELETE FROM door_styles WHERE id = ?`, [extra.id]);
      console.log(`  → Deleted Madison WS style record`);
      totalDeleted++;
    } else {
      // No Ashford WS style exists — just reassign this one to Ashford
      await conn.query(`UPDATE door_styles SET distributorId = 2 WHERE id = ?`, [extra.id]);
      console.log(`  → No Ashford WS found — reassigned this style to Ashford`);
    }
    continue;
  }
  
  // For all other extras: find the matching Preston style with the same code
  const [prestonMatch] = await conn.query(`
    SELECT ds.id, ds.ourName, COUNT(dsk.id) as skuCount
    FROM door_styles ds
    LEFT JOIN distributor_skus dsk ON dsk.styleId = ds.id
    WHERE ds.distributorId = 3 AND ds.styleCode = ?
    GROUP BY ds.id, ds.ourName
    LIMIT 1
  `, [extra.styleCode]);
  
  if (prestonMatch.length > 0) {
    const target = prestonMatch[0];
    console.log(`  → Merging into Preston ${extra.styleCode} "${target.ourName}" (id=${target.id}, currently ${target.skuCount} SKUs)`);
    
    // Move all SKUs from this Madison style to the Preston style
    const [moveResult] = await conn.query(`
      UPDATE distributor_skus 
      SET styleId = ?, distributorId = 3
      WHERE styleId = ?
    `, [target.id, extra.id]);
    console.log(`  → Moved ${moveResult.affectedRows} SKUs to Preston ${extra.styleCode}`);
    totalMoved += moveResult.affectedRows;
    
    // Delete the Madison duplicate style record
    await conn.query(`DELETE FROM door_styles WHERE id = ?`, [extra.id]);
    console.log(`  → Deleted Madison duplicate style record`);
    totalDeleted++;
  } else {
    // No Preston match — reassign to Preston
    console.log(`  → No Preston ${extra.styleCode} found — reassigning this style to Preston`);
    await conn.query(`UPDATE door_styles SET distributorId = 3 WHERE id = ?`, [extra.id]);
  }
}

// Final verification
const [madisonCount] = await conn.query(`
  SELECT COUNT(*) as cnt FROM door_styles WHERE distributorId = 1
`);

const [prestonCount] = await conn.query(`
  SELECT COUNT(*) as cnt FROM door_styles WHERE distributorId = 3
`);

const [ashfordCount] = await conn.query(`
  SELECT COUNT(*) as cnt FROM door_styles WHERE distributorId = 2
`);

// Check for multi-distributor conflicts
const [conflicts] = await conn.query(`
  SELECT COUNT(*) as cnt
  FROM (
    SELECT styleId, COUNT(DISTINCT distributorId) as distCount
    FROM distributor_skus
    GROUP BY styleId
    HAVING COUNT(DISTINCT distributorId) > 1
  ) t
`);

// Summary by distributor
const [summary] = await conn.query(`
  SELECT d.name, COUNT(DISTINCT ds.id) as styleCount, COUNT(dsk.id) as skuCount
  FROM distributors d
  LEFT JOIN door_styles ds ON ds.distributorId = d.id
  LEFT JOIN distributor_skus dsk ON dsk.styleId = ds.id
  GROUP BY d.id, d.name
  ORDER BY d.name
`);

console.log('\n=== SUMMARY ===');
console.log(`SKUs moved: ${totalMoved}`);
console.log(`Style records deleted: ${totalDeleted}`);
console.log(`Multi-distributor conflicts: ${conflicts[0].cnt}`);
console.log('\nDistributor breakdown:');
for (const row of summary) {
  console.log(`  ${row.name}: ${row.styleCount} styles, ${row.skuCount} SKUs`);
}

// List final Madison styles to confirm exactly 21
const [finalMadison] = await conn.query(`
  SELECT ds.styleCode, ds.ourName, COUNT(dsk.id) as skuCount
  FROM door_styles ds
  LEFT JOIN distributor_skus dsk ON dsk.styleId = ds.id
  WHERE ds.distributorId = 1
  GROUP BY ds.id, ds.styleCode, ds.ourName
  ORDER BY ds.styleCode
`);

console.log(`\nFinal Madison styles (${finalMadison.length}):`);
for (const s of finalMadison) {
  console.log(`  ${s.styleCode.padEnd(6)} ${s.ourName.padEnd(35)} ${s.skuCount} SKUs`);
}

await conn.end();
