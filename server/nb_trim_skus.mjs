import 'dotenv/config';
import mysql from 'mysql2/promise';
const c = await mysql.createConnection(process.env.DATABASE_URL);
// find cabinets that look like trim/moulding
const [cab] = await c.query(
  `SELECT masterCode, description, category, subCategory
   FROM cabinets
   WHERE category='Accessory' OR subCategory LIKE '%old%' OR subCategory LIKE '%rim%'
      OR masterCode LIKE 'CM%' OR masterCode LIKE '%CM-%' OR masterCode LIKE '%TK%'
      OR masterCode LIKE 'LR%' OR masterCode LIKE 'BAM%' OR masterCode LIKE '%CROWN%'
   ORDER BY masterCode LIMIT 40`);
console.log('Trim-ish cabinets in catalog:', cab.length);
console.table(cab);
await c.end();
