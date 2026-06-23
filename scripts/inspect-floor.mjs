import mysql from "mysql2/promise";
const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [r] = await conn.query(
  `SELECT c.category, COUNT(*) n, ROUND(AVG(s.homeownerPrice/s.yourCost),2) avg_mult
   FROM distributor_skus s JOIN cabinets c ON c.id=s.cabinetId
   WHERE s.homeownerPrice < s.yourCost*1.7 AND s.yourCost IS NOT NULL
   GROUP BY c.category ORDER BY n DESC`
);
console.table(r);
await conn.end();
