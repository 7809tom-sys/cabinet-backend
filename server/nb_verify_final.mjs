import 'dotenv/config';
import mysql from 'mysql2/promise';
const c = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await c.query(
  `SELECT id,styleCode,ourName,doorStyle,doorSampleVerified,
          CASE WHEN doorSampleImageUrl LIKE '%v2%' THEN 'v2' ELSE 'OLD' END AS img
   FROM door_styles WHERE distributorId=2 ORDER BY styleCode`);
console.table(rows);
const [[{cnt}]] = await c.query("SELECT COUNT(*) cnt FROM door_styles WHERE distributorId=2");
console.log('Clark And Son door_styles total:', cnt);
// DN pricing sanity
const [[dnp]] = await c.query(
  `SELECT COUNT(*) total,
          SUM(isPublished=1) pub,
          SUM(isPublished=0) conflictish
   FROM distributor_skus ds
   JOIN door_styles d ON d.id=ds.styleId
   WHERE d.styleCode='DN' AND d.distributorId=2`);
console.log('DN skus:', JSON.stringify(dnp));
await c.end();
