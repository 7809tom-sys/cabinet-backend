import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const [rows] = await conn.query(`
  SELECT c.category, COUNT(*) as count
  FROM cabinets c
  LEFT JOIN distributor_skus ds ON ds.cabinetId = c.id AND ds.status = 'approved'
  WHERE ds.id IS NULL AND c.isActive = 1
  GROUP BY c.category
  ORDER BY count DESC
`);

let total = 0;
for (const r of rows) {
  console.log(`${r.category}: ${r.count}`);
  total += Number(r.count);
}
console.log(`\nTOTAL: ${total}`);

await conn.end();
