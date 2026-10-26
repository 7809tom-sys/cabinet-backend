import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const DIST_NAMES = { 1: 'Madison', 2: 'Ashford', 3: 'Preston' };

console.log('=== Final Verification: Distributor Exclusivity ===\n');

// 1. Check for multi-distributor conflicts
const [conflicts] = await conn.query(`
  SELECT ds.id, ds.styleCode, ds.ourName,
    GROUP_CONCAT(DISTINCT dsk.distributorId ORDER BY dsk.distributorId) as distIds,
    COUNT(DISTINCT dsk.distributorId) as distCount
  FROM distributor_skus dsk
  JOIN door_styles ds ON ds.id = dsk.styleId
  GROUP BY ds.id, ds.styleCode, ds.ourName
  HAVING COUNT(DISTINCT dsk.distributorId) > 1
`);

console.log(`Multi-distributor conflicts: ${conflicts.length}`);
if (conflicts.length > 0) {
  for (const c of conflicts) {
    console.log(`  ❌ "${c.ourName}" (${c.styleCode}) has SKUs from distributors: ${c.distIds}`);
  }
}

// 2. Check for styles where distributorId doesn't match SKU distributor
const [mismatches] = await conn.query(`
  SELECT ds.id, ds.styleCode, ds.ourName, ds.distributorId,
    dsk_agg.actualDistId
  FROM door_styles ds
  JOIN (
    SELECT styleId, distributorId as actualDistId
    FROM distributor_skus
    GROUP BY styleId, distributorId
  ) dsk_agg ON dsk_agg.styleId = ds.id
  WHERE ds.distributorId != dsk_agg.actualDistId
`);

console.log(`DistributorId mismatches: ${mismatches.length}`);
if (mismatches.length > 0) {
  for (const m of mismatches) {
    console.log(`  ❌ "${m.ourName}" (${m.styleCode}) assigned to ${DIST_NAMES[m.distributorId]} but SKUs are from ${DIST_NAMES[m.actualDistId]}`);
  }
}

// 3. Summary by distributor
const [summary] = await conn.query(`
  SELECT d.name, 
    COUNT(DISTINCT ds.id) as styleCount, 
    COUNT(dsk.id) as skuCount,
    SUM(CASE WHEN dsk.isAvailable = 1 THEN 1 ELSE 0 END) as availableSkus
  FROM distributors d
  LEFT JOIN door_styles ds ON ds.distributorId = d.id
  LEFT JOIN distributor_skus dsk ON dsk.styleId = ds.id
  GROUP BY d.id, d.name
  ORDER BY d.name
`);

console.log('\nDistributor summary:');
for (const row of summary) {
  console.log(`  ${row.name}: ${row.styleCount} styles, ${row.skuCount} total SKUs (${row.availableSkus} available)`);
}

// 4. List all active styles per distributor
const [activeStyles] = await conn.query(`
  SELECT ds.styleCode, ds.ourName, ds.distributorId, 
    COUNT(dsk.id) as skuCount
  FROM door_styles ds
  JOIN distributor_skus dsk ON dsk.styleId = ds.id
  GROUP BY ds.id, ds.styleCode, ds.ourName, ds.distributorId
  ORDER BY ds.distributorId, ds.styleCode
`);

const grouped = {};
for (const s of activeStyles) {
  const distName = DIST_NAMES[s.distributorId] || 'Unknown';
  if (!grouped[distName]) grouped[distName] = [];
  grouped[distName].push(s);
}

for (const [distName, styles] of Object.entries(grouped)) {
  console.log(`\n${distName} (${styles.length} active styles):`);
  for (const s of styles) {
    console.log(`  ${s.styleCode.padEnd(6)} ${s.ourName.padEnd(30)} ${s.skuCount} SKUs`);
  }
}

if (conflicts.length === 0 && mismatches.length === 0) {
  console.log('\n✅ All checks passed — distributor exclusivity is enforced.');
} else {
  console.log('\n⚠️  Issues found — review above.');
}

await conn.end();
