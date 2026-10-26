import 'dotenv/config';
import mysql from 'mysql2/promise';
const c = await mysql.createConnection(process.env.DATABASE_URL);
const [[{ n }]] = await c.query('SELECT COUNT(*) as n FROM cabinets WHERE isActive=1 AND (catalogImageUrl IS NULL OR catalogImageUrl="")');
console.log('Still missing images:', n);
const [rows] = await c.query('SELECT masterCode, description FROM cabinets WHERE isActive=1 AND (catalogImageUrl IS NULL OR catalogImageUrl="") ORDER BY masterCode');
for (const r of rows) console.log(' ', r.masterCode, '|', r.description?.substring(0,50));
await c.end();
