import 'dotenv/config';
import mysql from 'mysql2/promise';
const c = await mysql.createConnection(process.env.DATABASE_URL);
const codes = ['TK-8','LRM-8','BAM','SM-8','BF-3','BFF-3','VA-48'];
for (const code of codes) {
  const [rows] = await c.query(
    `SELECT ds.styleId, ds.isPublished, ds.isAvailable, d.ourName 
     FROM distributor_skus ds 
     JOIN cabinets cb ON cb.id = ds.cabinetId 
     LEFT JOIN door_styles d ON d.id = ds.styleId
     WHERE cb.masterCode = ? LIMIT 10`, [code]);
  console.log(`${code}: ${rows.length} SKUs`);
  for (const r of rows) console.log(`  styleId=${r.styleId} pub=${r.isPublished} avail=${r.isAvailable} style=${r.ourName}`);
}
await c.end();
