import 'dotenv/config';
import mysql from 'mysql2/promise';
const c = await mysql.createConnection(process.env.DATABASE_URL);
// Look at generic (non-DN) moulding master codes and whether priced SKUs exist
const [ml] = await c.query(
  `SELECT masterCode, description FROM cabinets
   WHERE (description LIKE '%Crown%' OR description LIKE '%Molding%' OR description LIKE '%Moulding%'
          OR description LIKE '%Light Rail%' OR description LIKE '%Toe%' OR description LIKE '%Filler%')
     AND masterCode NOT LIKE 'DN-%'
   ORDER BY masterCode LIMIT 60`);
console.log('Generic moulding-ish master codes:', ml.length);
for (const r of ml) console.log(r.masterCode, '::', r.description);
// how does design.ts CM-8 map? check any cabinet with CM
const [cm] = await c.query("SELECT masterCode,description FROM cabinets WHERE masterCode LIKE 'CM%' OR masterCode='CM-8' LIMIT 10");
console.log('\nCM codes:', JSON.stringify(cm));
await c.end();
