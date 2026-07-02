import 'dotenv/config';
import mysql from 'mysql2/promise';
const c = await mysql.createConnection(process.env.DATABASE_URL);
// Does the DN line have priced SKUs for CM-8 / TK-8 / LRM-8 / BAM? Check how trim is priced per style.
const codes = ['CM-8','TK-8','LRM-8','LRM','BAM','SM-8','BF-3'];
for (const code of codes) {
  const [rows] = await c.query(
    `SELECT ds.styleId, d.styleCode, d.ourName, ds.listPrice, ds.yourCost, ds.isPublished
     FROM distributor_skus ds
     JOIN cabinets cb ON cb.id = ds.cabinetId
     JOIN door_styles d ON d.id = ds.styleId
     WHERE cb.masterCode = ? AND d.distributorId=2
     LIMIT 5`, [code]);
  console.log(`\n${code}: ${rows.length} Clark&Son SKUs`);
  for (const r of rows) console.log('   ', r.styleCode, r.ourName, 'list', r.listPrice, 'cost', r.yourCost, 'pub', r.isPublished);
}
await c.end();
