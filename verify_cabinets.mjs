import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Remaining cabinets by category
const [cats] = await conn.query(`
  SELECT category, COUNT(*) as count
  FROM cabinets WHERE isActive = 1
  GROUP BY category ORDER BY count DESC
`);
let total = 0;
console.log('=== Remaining cabinets by category ===');
for (const r of cats) {
  console.log(`  ${r.category}: ${r.count}`);
  total += Number(r.count);
}
console.log(`  TOTAL: ${total}`);

// Confirm none have zero approved SKUs
const [orphans] = await conn.query(`
  SELECT COUNT(*) as cnt
  FROM cabinets c
  LEFT JOIN distributor_skus ds ON ds.cabinetId = c.id AND ds.status = 'approved'
  WHERE ds.id IS NULL AND c.isActive = 1
`);
console.log(`\n=== Cabinets still with no approved SKUs: ${orphans[0].cnt} ===`);

// Total approved distributor_skus
const [skuCount] = await conn.query(`SELECT COUNT(*) as cnt FROM distributor_skus WHERE status = 'approved'`);
console.log(`=== Total approved distributor_skus: ${skuCount[0].cnt} ===`);

await conn.end();
