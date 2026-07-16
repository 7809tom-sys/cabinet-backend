import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Distributor IDs
const DIST = { madison: 1, ashford: 2, preston: 3 };

// Authoritative mapping: ourName → distributorId
// Note: same "ourName" can appear in multiple distributors — they are DIFFERENT styles
// We match by distributorId + ourName combination
const mapping = [
  // Ashford (Clark and Son) styles
  { distId: DIST.ashford, ourNames: ['Lumina White','Aura Cream','Terra Shaker','Forest Rust','Natura Maple','Villa Blanc','Zenith Sage','Silva Shaker','Onyx Shadow','Slate Echo','Sterling Pulse','Nimbus Grey','Nova White'] },
  // Preston (Skyline) styles  
  { distId: DIST.preston, ourNames: ['Blanc Core','Umbra Shaker','Cobalt Abyss','Virid Echo','Obsidian Forge','Vesper Ash','Selene Gray','Zephyr Sage','Aurum Vault','Sylvan Rust','Lumina Blanc','Carbon Frost','Dual Vesper','Dual Blanc','Haven White','Aero Blanc','Aero Sage','Aero Obsidian','Aero Solstice','Air Dawn','Glace Blanc','Glace Cinder','Vellum Noir','Vellum Crema','Solis Oak','Umbra Oak','Prism Clear','Nocturne Glass','Bloom Blanc','Bloom Cinder','Bloom Umbra'] },
  // Madison (US Cabinet Depot) styles
  { distId: DIST.madison, ourNames: ['Aura Blanc','Nimbus Blanc','Slate Core','Ivy Core','Navy Core','Onyx Core','Honey Core','Cinder Core','Edge Blanc','Oxford Blanc','Sage Haven','Antique White','Walnut Haven','Irory Dune','Slate Gray','Warm Toffee','Warm Mocha','Rift Oak','Natural Maple','Warm Cashmere'] },
];

// Note: "Nova White" appears in both Ashford (WS) and Madison (SW) — these are different door styles
// "Cinder Core" appears in both Preston (GR) and Madison (SC) — different styles
// We need to handle these by checking which distributor currently has SKUs for that style

console.log('=== Fixing distributor exclusivity ===\n');

// Step 1: Get all door styles with their current distributor assignments
const [styles] = await conn.query(`
  SELECT ds.id, ds.ourName, ds.distributorId, d.name as distName,
    (SELECT COUNT(*) FROM distributor_skus dsk WHERE dsk.styleId = ds.id) as totalSkus
  FROM door_styles ds
  LEFT JOIN distributors d ON d.id = ds.distributorId
  ORDER BY ds.ourName
`);

console.log(`Total door styles: ${styles.length}`);

// Step 2: Find styles that have SKUs from multiple distributors
const [conflicts] = await conn.query(`
  SELECT 
    ds.id as styleId,
    ds.ourName,
    ds.distributorId as assignedDistId,
    GROUP_CONCAT(DISTINCT dsk.distributorId ORDER BY dsk.distributorId) as skuDistIds,
    COUNT(DISTINCT dsk.distributorId) as distCount
  FROM door_styles ds
  JOIN distributor_skus dsk ON dsk.styleId = ds.id
  GROUP BY ds.id, ds.ourName, ds.distributorId
  HAVING COUNT(DISTINCT dsk.distributorId) > 1
`);

console.log(`\nStyles with multi-distributor SKUs: ${conflicts.length}`);

let totalDeleted = 0;
let totalFixed = 0;

for (const conflict of conflicts) {
  const skuDistIds = conflict.skuDistIds.split(',').map(Number);
  const assignedDistId = conflict.assignedDistId;
  
  console.log(`\nStyle: "${conflict.ourName}" (id=${conflict.styleId})`);
  console.log(`  Assigned to: distributor ${assignedDistId}`);
  console.log(`  Has SKUs from: ${skuDistIds.join(', ')}`);
  
  // Determine the correct distributor for this style
  // Check our mapping
  let correctDistId = null;
  for (const { distId, ourNames } of mapping) {
    if (ourNames.includes(conflict.ourName)) {
      correctDistId = distId;
      break;
    }
  }
  
  if (!correctDistId) {
    // Fall back to the distributor with the most SKUs
    const [counts] = await conn.query(`
      SELECT distributorId, COUNT(*) as cnt 
      FROM distributor_skus 
      WHERE styleId = ? 
      GROUP BY distributorId 
      ORDER BY cnt DESC 
      LIMIT 1
    `, [conflict.styleId]);
    correctDistId = counts[0]?.distributorId || assignedDistId;
    console.log(`  No mapping found — using distributor with most SKUs: ${correctDistId}`);
  } else {
    console.log(`  Correct distributor from mapping: ${correctDistId}`);
  }
  
  // Delete SKUs from wrong distributors
  for (const wrongDistId of skuDistIds) {
    if (wrongDistId !== correctDistId) {
      const [delResult] = await conn.query(`
        DELETE FROM distributor_skus 
        WHERE styleId = ? AND distributorId = ?
      `, [conflict.styleId, wrongDistId]);
      console.log(`  Deleted ${delResult.affectedRows} SKUs from distributor ${wrongDistId}`);
      totalDeleted += delResult.affectedRows;
    }
  }
  
  // Update the door style's assigned distributor if needed
  if (assignedDistId !== correctDistId) {
    await conn.query(`UPDATE door_styles SET distributorId = ? WHERE id = ?`, [correctDistId, conflict.styleId]);
    console.log(`  Updated door_style distributorId: ${assignedDistId} → ${correctDistId}`);
    totalFixed++;
  }
}

// Step 3: Also fix door styles whose distributorId doesn't match any of their SKUs' distributors
const [orphans] = await conn.query(`
  SELECT ds.id, ds.ourName, ds.distributorId,
    (SELECT distributorId FROM distributor_skus WHERE styleId = ds.id LIMIT 1) as actualDistId
  FROM door_styles ds
  WHERE ds.distributorId IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM distributor_skus dsk 
      WHERE dsk.styleId = ds.id AND dsk.distributorId = ds.distributorId
    )
    AND EXISTS (
      SELECT 1 FROM distributor_skus dsk WHERE dsk.styleId = ds.id
    )
`);

console.log(`\nStyles with mismatched distributorId (no SKUs from assigned dist): ${orphans.length}`);
for (const o of orphans) {
  if (o.actualDistId) {
    await conn.query(`UPDATE door_styles SET distributorId = ? WHERE id = ?`, [o.actualDistId, o.id]);
    console.log(`  Fixed "${o.ourName}": ${o.distributorId} → ${o.actualDistId}`);
    totalFixed++;
  }
}

// Final verification
const [finalCheck] = await conn.query(`
  SELECT COUNT(DISTINCT dsk.distributorId) as distCount, ds.ourName
  FROM distributor_skus dsk
  JOIN door_styles ds ON ds.id = dsk.styleId
  GROUP BY dsk.styleId
  HAVING COUNT(DISTINCT dsk.distributorId) > 1
`);

console.log(`\n=== SUMMARY ===`);
console.log(`SKUs deleted (wrong distributor): ${totalDeleted}`);
console.log(`Door styles re-assigned: ${totalFixed}`);
console.log(`Remaining multi-distributor conflicts: ${finalCheck.length}`);
if (finalCheck.length > 0) {
  console.log('Remaining conflicts:', finalCheck);
}

await conn.end();
