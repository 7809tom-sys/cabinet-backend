import 'dotenv/config';
import mysql from 'mysql2/promise';
const c = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await c.query("SELECT masterCode FROM cabinets WHERE isActive=1 AND masterCode LIKE 'W%' ORDER BY masterCode LIMIT 40");
console.log('Wall codes sample:', rows.map(r=>r.masterCode).join(', '));
console.log('---');
for (const q of ['w31824','w2736','wdc2430','w1830','w2130','w3612','b21','b18','hb21','wf3','rw3618','ls3612','tfhb21','b33','sb36']) {
  const canon = q.toUpperCase().replace(/[^A-Z0-9]/g,'');
  const [m] = await c.query("SELECT masterCode FROM cabinets WHERE isActive=1 AND UPPER(REPLACE(REPLACE(masterCode,'-',''),' ','')) LIKE ? LIMIT 6", [`%${canon}%`]);
  console.log(q.padEnd(10), '=>', m.map(x=>x.masterCode).join(', ') || '(none)');
}
await c.end();
