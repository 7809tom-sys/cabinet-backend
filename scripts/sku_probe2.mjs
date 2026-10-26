import "dotenv/config";
import mysql from "mysql2/promise";
const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute(`
  SELECT c.masterCode,
         GROUP_CONCAT(DISTINCT ds.distributorSku ORDER BY ds.distributorSku SEPARATOR ' | ') AS alt_distributor_skus,
         COUNT(DISTINCT ds.distributorId) AS num_lines
  FROM cabinets c JOIN distributor_skus ds ON ds.cabinetId=c.id
  WHERE c.masterCode IN ('DWR-3','BDEP','BEP-3')
  GROUP BY c.masterCode
`);
for (const r of rows) console.log(r.masterCode, '=>', r.alt_distributor_skus, '(lines:', r.num_lines + ')');
await conn.end();
