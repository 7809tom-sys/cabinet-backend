import 'dotenv/config';
import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);
for (const t of ['pricing_settings','platform_pricing_settings']) {
  const [rows] = await conn.query(`SELECT * FROM \`${t}\``);
  console.log(`=== ${t} ===`);
  console.log(JSON.stringify(rows, null, 2));
}
await conn.end();
