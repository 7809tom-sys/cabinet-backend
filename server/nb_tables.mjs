import 'dotenv/config';
import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [tables] = await conn.query("SHOW TABLES");
const names = tables.map(t=>Object.values(t)[0]);
console.log("TABLES:", names.join(", "));
for (const n of names) {
  const [c] = await conn.query(`SELECT COUNT(*) AS n FROM \`${n}\``);
  console.log(`  ${n}: ${c[0].n} rows`);
}
await conn.end();
