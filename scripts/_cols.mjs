import 'dotenv/config';
import mysql from 'mysql2/promise';
const c = await mysql.createConnection(process.env.DATABASE_URL);
const [cols] = await c.query("SHOW COLUMNS FROM cabinets");
console.log(cols.map(x=>x.Field).join(', '));
await c.end();
