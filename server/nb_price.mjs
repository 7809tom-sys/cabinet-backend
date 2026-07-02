import 'dotenv/config';
import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [tables] = await conn.query("SHOW TABLES");
console.log("=== TABLES ===");
console.log(tables.map(t=>Object.values(t)[0]).join("\n"));
await conn.end();
