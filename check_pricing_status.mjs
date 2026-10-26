import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// 1. Check distributor costMultiplier
const [distRows] = await conn.query(
  'SELECT id, name, costMultiplier, baseMultiplier FROM distributors WHERE name LIKE "%Cabinet Depot%" OR name LIKE "%USCD%" LIMIT 5'
);
console.log('=== Distributor Settings ===');
for (const r of distRows) {
  console.log(`${r.name}: costMultiplier=${r.costMultiplier}, baseMultiplier=${r.baseMultiplier}`);
}

// 2. Check status counts
const [statusRows] = await conn.query(
  'SELECT status, COUNT(*) as count FROM distributor_skus GROUP BY status'
);
console.log('\n=== Status Counts ===');
for (const r of statusRows) {
  console.log(`${r.status}: ${r.count}`);
}

// 3. Check for any approved SKUs with suspiciously high prices (over $1000)
const [highPriceRows] = await conn.query(
  'SELECT distributorSku, listPrice, yourCost FROM distributor_skus WHERE status = "approved" AND listPrice > 1000 ORDER BY listPrice DESC LIMIT 10'
);
console.log('\n=== Approved SKUs with listPrice > $1000 ===');
for (const r of highPriceRows) {
  console.log(`${r.distributorSku}: $${r.listPrice}`);
}

// 4. Sample of approved SKUs with prices
const [sampleRows] = await conn.query(
  'SELECT distributorSku, listPrice, yourCost FROM distributor_skus WHERE status = "approved" ORDER BY distributorSku LIMIT 10'
);
console.log('\n=== Sample Approved SKUs ===');
for (const r of sampleRows) {
  console.log(`${r.distributorSku}: listPrice=$${r.listPrice}, yourCost=$${r.yourCost}`);
}

await conn.end();
