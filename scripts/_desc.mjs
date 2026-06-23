import 'dotenv/config';
import mysql from 'mysql2/promise';
const c = await mysql.createConnection(process.env.DATABASE_URL);
const want = ['RS','WF','F','BF','BFF','DCW','DCFF','DCSF','LSB','RH','RHC','WDC','HB','RW','LS','FHB','BFH'];
for (const p of want) {
  const [rows] = await c.query("SELECT masterCode, description FROM cabinets WHERE isActive=1 AND masterCode LIKE ? ORDER BY masterCode LIMIT 4", [p+'-%']);
  const [rows2] = await c.query("SELECT masterCode, description FROM cabinets WHERE isActive=1 AND masterCode REGEXP ? ORDER BY masterCode LIMIT 4", ['^'+p+'[0-9]']);
  const all=[...rows,...rows2];
  console.log(p.padEnd(6), '=>', all.length? all.map(r=>`${r.masterCode}: ${(r.description||'').slice(0,40)}`).join(' | ') : '(no codes with this prefix)');
}
await c.end();
