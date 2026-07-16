import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const [summary] = await conn.query(`
  SELECT d.name, COUNT(DISTINCT ds.id) as styleCount, COUNT(dsk.id) as skuCount
  FROM distributors d
  LEFT JOIN door_styles ds ON ds.distributorId = d.id
  LEFT JOIN distributor_skus dsk ON dsk.styleId = ds.id
  GROUP BY d.id, d.name
  ORDER BY d.name
`);

const [conflicts] = await conn.query(`
  SELECT COUNT(*) as cnt FROM (
    SELECT styleId, COUNT(DISTINCT distributorId) as distCount
    FROM distributor_skus GROUP BY styleId HAVING COUNT(DISTINCT distributorId) > 1
  ) t
`);

console.log('Distributor breakdown:');
for (const r of summary) {
  console.log(`  ${r.name}: ${r.styleCount} styles, ${r.skuCount} SKUs`);
}
console.log(`Multi-distributor conflicts: ${conflicts[0].cnt}`);

// Madison list
const [madison] = await conn.query(`
  SELECT ds.styleCode, ds.ourName, COUNT(dsk.id) as skuCount
  FROM door_styles ds
  LEFT JOIN distributor_skus dsk ON dsk.styleId = ds.id
  WHERE ds.distributorId = 1
  GROUP BY ds.id, ds.styleCode, ds.ourName ORDER BY ds.styleCode
`);
console.log(`\nMadison (${madison.length}):`);
for (const r of madison) console.log(`  ${r.styleCode.padEnd(6)} ${r.ourName.padEnd(35)} ${r.skuCount} SKUs`);

// Preston list
const [preston] = await conn.query(`
  SELECT ds.styleCode, ds.ourName, COUNT(dsk.id) as skuCount
  FROM door_styles ds
  LEFT JOIN distributor_skus dsk ON dsk.styleId = ds.id
  WHERE ds.distributorId = 3
  GROUP BY ds.id, ds.styleCode, ds.ourName ORDER BY ds.styleCode
`);
console.log(`\nPreston (${preston.length}):`);
for (const r of preston) console.log(`  ${r.styleCode.padEnd(6)} ${r.ourName.padEnd(35)} ${r.skuCount} SKUs`);

await conn.end();
