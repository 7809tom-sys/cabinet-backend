import 'dotenv/config';
import mysql from 'mysql2/promise';
const c = await mysql.createConnection(process.env.DATABASE_URL);
// Which crown / light-rail / toe / batten / filler codes have the MOST Clark&Son style coverage?
const [rows] = await c.query(
  `SELECT cb.masterCode, COUNT(DISTINCT ds.styleId) styles, cb.description
   FROM distributor_skus ds
   JOIN cabinets cb ON cb.id = ds.cabinetId
   JOIN door_styles d ON d.id = ds.styleId
   WHERE d.distributorId=2
     AND (cb.description LIKE '%Crown%' OR cb.description LIKE '%Light Rail%'
          OR cb.description LIKE '%Toe%' OR cb.description LIKE '%Batten%'
          OR cb.masterCode LIKE 'CM%' OR cb.masterCode LIKE 'LRM%' OR cb.masterCode LIKE 'TK%' OR cb.masterCode='BAM')
   GROUP BY cb.masterCode, cb.description
   ORDER BY styles DESC, cb.masterCode`);
for (const r of rows) console.log(String(r.styles).padStart(2), r.masterCode.padEnd(10), r.description.slice(0,50));
await c.end();
