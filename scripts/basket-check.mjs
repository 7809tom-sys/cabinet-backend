import mysql from "mysql2/promise";
const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [r] = await conn.query(
  `SELECT c.masterCode,
          ROUND(AVG(s.homeownerPrice)) new_home,
          ROUND(AVG(s.adjustedListPrice)) compare_at,
          ROUND(MIN((s.homeownerPrice-s.yourCost)/s.homeownerPrice*100)) min_margin
   FROM distributor_skus s JOIN cabinets c ON c.id=s.cabinetId
   WHERE c.masterCode IN ('B-12','B-18','SB-30','SB-36','U-24-84','U-24-90')
   GROUP BY c.masterCode ORDER BY c.masterCode`
);
console.table(r);
await conn.end();
