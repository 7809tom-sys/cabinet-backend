import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const [rows] = await conn.query(`
  SELECT 
    LEFT(conflictReason, 80) as reason,
    COUNT(*) as count
  FROM cabinets
  WHERE conflictStatus = 'conflict'
  GROUP BY LEFT(conflictReason, 80)
  ORDER BY count DESC
`);

let total = 0;
for (const r of rows) {
  console.log(`${r.count} | ${r.reason || '(no reason)'}`);
  total += Number(r.count);
}
console.log(`\nTOTAL in conflict: ${total}`);

await conn.end();
