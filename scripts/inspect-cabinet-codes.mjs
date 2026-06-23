import "dotenv/config";
import mysql from "mysql2/promise";

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.query(
  `SELECT c.id, c.masterCode, c.description, c.category, c.subCategory, c.placementType,
          c.width, c.height, c.depth, c.catalogImageUrl,
          (SELECT COUNT(*) FROM distributor_skus s WHERE s.cabinetId = c.id) AS skuCount,
          (SELECT COUNT(*) FROM distributor_skus s WHERE s.cabinetId = c.id AND s.isAvailable = 1) AS availSkus
   FROM cabinets c
   WHERE c.masterCode LIKE 'BEC%' OR c.masterCode LIKE 'BES%'
      OR c.masterCode LIKE 'BWB%' OR c.masterCode LIKE 'SB-15MINI%'
   ORDER BY c.masterCode`
);
for (const r of rows) {
  console.log(`#${r.id} | ${r.masterCode} | "${r.description}" | cat=${r.category} sub=${r.subCategory ?? ""} place=${r.placementType ?? ""} | ${r.width}x${r.height}x${r.depth} | skus=${r.skuCount} avail=${r.availSkus} | img=${r.catalogImageUrl ? "yes" : "NO"}`);
}
console.log(`\n${rows.length} rows`);
process.exit(0);
