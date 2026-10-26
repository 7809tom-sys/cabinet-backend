import "dotenv/config";
import mysql from "mysql2/promise";
const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute(`
  SELECT c.masterCode, c.description, ds.distributorId, ds.styleId, ds.platformSku, ds.distributorSku
  FROM cabinets c JOIN distributor_skus ds ON ds.cabinetId=c.id
  WHERE c.masterCode IN ('DWR-3','BDEP','BEP-3')
  ORDER BY c.masterCode, ds.distributorId LIMIT 30
`);
console.table(rows);
await conn.end();
