import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const DIST = { madison: 1, ashford: 2, preston: 3 };
const DIST_NAMES = { 1: 'Madison', 2: 'Ashford', 3: 'Preston' };

console.log('=== Fix v3: Align door_styles.distributorId with actual SKU distributor ===\n');

// The core principle: each door style's distributorId should match the distributor
// that actually has SKUs for that style. Since we already have 0 multi-distributor
// conflicts (each style's SKUs all come from one distributor), we just need to make
// sure the distributorId field matches.

// Get all door styles that have SKUs but whose distributorId doesn't match the SKU distributor
const [mismatches] = await conn.query(`
  SELECT 
    ds.id,
    ds.styleCode,
    ds.ourName,
    ds.distributorId as assignedDistId,
    dsk_dist.distributorId as actualDistId,
    dsk_dist.cnt as skuCount
  FROM door_styles ds
  JOIN (
    SELECT styleId, distributorId, COUNT(*) as cnt
    FROM distributor_skus
    GROUP BY styleId, distributorId
  ) dsk_dist ON dsk_dist.styleId = ds.id
  WHERE ds.distributorId != dsk_dist.distributorId
  ORDER BY ds.styleCode
`);

console.log(`Styles with mismatched distributorId: ${mismatches.length}`);

let fixed = 0;
for (const m of mismatches) {
  console.log(`  Fixing "${m.ourName}" (${m.styleCode}): ${DIST_NAMES[m.assignedDistId]} → ${DIST_NAMES[m.actualDistId]} (${m.skuCount} SKUs)`);
  await conn.query(`UPDATE door_styles SET distributorId = ? WHERE id = ?`, [m.actualDistId, m.id]);
  fixed++;
}

// Final verification
const [remaining] = await conn.query(`
  SELECT 
    ds.id,
    ds.styleCode,
    ds.ourName,
    ds.distributorId as assignedDistId,
    dsk_dist.distributorId as actualDistId
  FROM door_styles ds
  JOIN (
    SELECT styleId, distributorId
    FROM distributor_skus
    GROUP BY styleId, distributorId
  ) dsk_dist ON dsk_dist.styleId = ds.id
  WHERE ds.distributorId != dsk_dist.distributorId
`);

const [conflicts] = await conn.query(`
  SELECT COUNT(*) as cnt
  FROM (
    SELECT styleId, COUNT(DISTINCT distributorId) as distCount
    FROM distributor_skus
    GROUP BY styleId
    HAVING COUNT(DISTINCT distributorId) > 1
  ) t
`);

const [summary] = await conn.query(`
  SELECT d.name, COUNT(DISTINCT ds.id) as styleCount, COUNT(dsk.id) as skuCount
  FROM distributors d
  LEFT JOIN door_styles ds ON ds.distributorId = d.id AND ds.distributorId IS NOT NULL
  LEFT JOIN distributor_skus dsk ON dsk.styleId = ds.id
  GROUP BY d.id, d.name
  ORDER BY d.name
`);

console.log(`\n=== RESULTS ===`);
console.log(`Fixed: ${fixed} door styles`);
console.log(`Remaining mismatches: ${remaining.length}`);
console.log(`Multi-distributor conflicts: ${conflicts[0].cnt}`);
console.log('\nDistributor breakdown:');
for (const row of summary) {
  console.log(`  ${row.name}: ${row.styleCount} styles, ${row.skuCount} SKUs`);
}

await conn.end();
