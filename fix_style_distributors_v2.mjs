import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Distributor IDs
const DIST = { madison: 1, ashford: 2, preston: 3 };

// Authoritative mapping: styleCode → distributorId
// Each code is unique within a distributor, but same code can appear in different distributors
// (e.g., SW = Shaker White in Preston, SW = Shaker White in Madison — these are DIFFERENT door styles)
// We use (distributorId, styleCode) as the unique key

// The authoritative assignment from the pasted spreadsheet:
const authoritative = [
  // Ashford (Clark and Son) — distId=2
  { distId: DIST.ashford, codes: ['ASP','CC','CS','RH','DN','GV','FS','HS','MBS','NG','PS','WPG','WS'] },
  // Preston (Skyline) — distId=3
  { distId: DIST.preston, codes: ['SW','GR','SE','NB','AG','IB','SA','LG','SB','TC','RW','AW','AC','DSG','DDW','CW','SDW','SAG','SIB','SAO','SWO','HW','HG','MB','MI','OB','OS','CG','MG','FW','FG','FE'] },
  // Madison (US Cabinet Depot) — distId=1
  { distId: DIST.madison, codes: ['SA','SD','SG','SW','SI','SN','SB','SH','SC','EW','OW','OS','CW','CS','HD','OM','OT','HE','SEO','SU','OC'] },
];

console.log('=== Precise Distributor Exclusivity Fix (v2) ===\n');

// Step 1: Get all door styles with their styleCode
const [styles] = await conn.query(`
  SELECT id, styleCode, ourName, distributorId
  FROM door_styles
  ORDER BY distributorId, styleCode
`);

console.log(`Total door styles: ${styles.length}`);

// Build a lookup: distributorId → Set of codes that belong to it
const distCodes = {};
for (const { distId, codes } of authoritative) {
  distCodes[distId] = new Set(codes);
}

let totalDeletedSkus = 0;
let totalFixedStyles = 0;

// Step 2: For each door style, check if its styleCode belongs to its assigned distributor
// If not, find the correct distributor and reassign
for (const style of styles) {
  const { id, styleCode, ourName, distributorId } = style;
  
  // Find which distributor this styleCode belongs to
  // A styleCode can exist in multiple distributors — we need to find the RIGHT one
  // The right one is determined by which distributor has SKUs for this style
  
  const [skuDists] = await conn.query(`
    SELECT distributorId, COUNT(*) as cnt
    FROM distributor_skus
    WHERE styleId = ?
    GROUP BY distributorId
    ORDER BY cnt DESC
  `, [id]);
  
  if (skuDists.length === 0) {
    // No SKUs — just check if the styleCode matches the assigned distributor
    const codesForDist = distCodes[distributorId];
    if (!codesForDist || !codesForDist.has(styleCode)) {
      // Find the correct distributor for this code
      let correctDistId = null;
      for (const { distId, codes } of authoritative) {
        if (codes.includes(styleCode)) {
          // Check if this distributor already has a style with this code
          const [existing] = await conn.query(
            `SELECT id FROM door_styles WHERE styleCode = ? AND distributorId = ? AND id != ?`,
            [styleCode, distId, id]
          );
          if (existing.length === 0) {
            correctDistId = distId;
            break;
          }
        }
      }
      if (correctDistId && correctDistId !== distributorId) {
        await conn.query(`UPDATE door_styles SET distributorId = ? WHERE id = ?`, [correctDistId, id]);
        console.log(`Reassigned "${ourName}" (${styleCode}): dist ${distributorId} → ${correctDistId} (no SKUs)`);
        totalFixedStyles++;
      }
    }
    continue;
  }
  
  if (skuDists.length === 1) {
    // Only one distributor has SKUs — that's the correct one
    const correctDistId = skuDists[0].distributorId;
    if (correctDistId !== distributorId) {
      await conn.query(`UPDATE door_styles SET distributorId = ? WHERE id = ?`, [correctDistId, id]);
      console.log(`Reassigned "${ourName}" (${styleCode}): dist ${distributorId} → ${correctDistId}`);
      totalFixedStyles++;
    }
    continue;
  }
  
  // Multiple distributors have SKUs for this style — need to pick the right one
  // Use the authoritative mapping: find which distributor this style's styleCode belongs to
  // considering that the same code can exist in multiple distributors
  
  // The correct distributor is the one that matches BOTH the styleCode AND the ourName pattern
  // Since we can't rely on ourName (it may not match yet), use the distributor that has the MOST SKUs
  // as a tiebreaker, but only among distributors that legitimately own this styleCode
  
  let correctDistId = null;
  
  // Find distributors that legitimately own this styleCode
  const legitimateOwners = authoritative
    .filter(({ codes }) => codes.includes(styleCode))
    .map(({ distId }) => distId);
  
  // Among the SKU distributors, find the one that is a legitimate owner
  const legitimateSkuDists = skuDists.filter(d => legitimateOwners.includes(d.distributorId));
  
  if (legitimateSkuDists.length === 1) {
    correctDistId = legitimateSkuDists[0].distributorId;
  } else if (legitimateSkuDists.length > 1) {
    // Multiple legitimate owners have SKUs — pick the one with most SKUs
    correctDistId = legitimateSkuDists[0].distributorId;
    console.log(`WARN: "${ourName}" (${styleCode}) has SKUs from multiple legitimate owners: ${legitimateSkuDists.map(d => d.distributorId + '(' + d.cnt + ')').join(', ')} — picking ${correctDistId}`);
  } else {
    // No legitimate owner has SKUs — pick the one with most SKUs
    correctDistId = skuDists[0].distributorId;
    console.log(`WARN: "${ourName}" (${styleCode}) has no legitimate owner in mapping — using dist with most SKUs: ${correctDistId}`);
  }
  
  // Delete SKUs from wrong distributors
  for (const { distributorId: wrongDistId, cnt } of skuDists) {
    if (wrongDistId !== correctDistId) {
      const [del] = await conn.query(`
        DELETE FROM distributor_skus WHERE styleId = ? AND distributorId = ?
      `, [id, wrongDistId]);
      console.log(`  Deleted ${del.affectedRows} SKUs from dist ${wrongDistId} for "${ourName}" (${styleCode})`);
      totalDeletedSkus += del.affectedRows;
    }
  }
  
  // Update door style distributor if needed
  if (correctDistId !== distributorId) {
    await conn.query(`UPDATE door_styles SET distributorId = ? WHERE id = ?`, [correctDistId, id]);
    console.log(`  Reassigned "${ourName}" (${styleCode}): dist ${distributorId} → ${correctDistId}`);
    totalFixedStyles++;
  }
}

// Final verification
const [conflicts] = await conn.query(`
  SELECT ds.ourName, COUNT(DISTINCT dsk.distributorId) as distCount
  FROM distributor_skus dsk
  JOIN door_styles ds ON ds.id = dsk.styleId
  GROUP BY dsk.styleId
  HAVING COUNT(DISTINCT dsk.distributorId) > 1
`);

// Summary by distributor
const [summary] = await conn.query(`
  SELECT d.name, COUNT(DISTINCT ds.id) as styleCount, COUNT(dsk.id) as skuCount
  FROM distributors d
  LEFT JOIN door_styles ds ON ds.distributorId = d.id
  LEFT JOIN distributor_skus dsk ON dsk.styleId = ds.id AND dsk.distributorId = d.id
  GROUP BY d.id, d.name
  ORDER BY d.name
`);

console.log('\n=== SUMMARY ===');
console.log(`SKUs deleted (cross-distributor): ${totalDeletedSkus}`);
console.log(`Door styles re-assigned: ${totalFixedStyles}`);
console.log(`Remaining multi-distributor conflicts: ${conflicts.length}`);
if (conflicts.length > 0) {
  console.log('Conflicts:', conflicts);
}
console.log('\nDistributor breakdown:');
for (const row of summary) {
  console.log(`  ${row.name}: ${row.styleCount} styles, ${row.skuCount} SKUs`);
}

await conn.end();
