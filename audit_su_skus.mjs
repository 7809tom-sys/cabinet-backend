import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Find the Shaker Unfinished door style
const [styles] = await conn.query(`
  SELECT id, ourName, distributorName, distributorId
  FROM door_styles
  WHERE ourName LIKE '%Unfinished%' OR distributorName LIKE '%Unfinished%'
    OR ourName LIKE '%SU%' OR distributorName LIKE '%SU%'
  ORDER BY ourName
`);
console.log('=== Door styles matching Shaker Unfinished ===');
for (const s of styles) {
  console.log(`  [${s.id}] ${s.ourName} / ${s.distributorName} (distributorId=${s.distributorId})`);
}

// Get all SU distributor SKUs
const [suSkus] = await conn.query(`
  SELECT ds.distributorSku, ds.listPrice, ds.yourCost, ds.status, c.masterCode, c.category, c.description
  FROM distributor_skus ds
  JOIN cabinets c ON c.id = ds.cabinetId
  WHERE ds.distributorSku LIKE 'SU-%'
  ORDER BY ds.distributorSku
`);
console.log(`\n=== SU- distributor SKUs in DB: ${suSkus.length} ===`);
for (const r of suSkus) {
  console.log(`  ${r.distributorSku} | $${r.listPrice} | ${r.status} | ${r.masterCode} | ${r.category}`);
}

// Count by status
const [statusCounts] = await conn.query(`
  SELECT status, COUNT(*) as count
  FROM distributor_skus
  WHERE distributorSku LIKE 'SU-%'
  GROUP BY status
`);
console.log('\n=== SU- SKU status breakdown ===');
for (const r of statusCounts) {
  console.log(`  ${r.status}: ${r.count}`);
}

await conn.end();
