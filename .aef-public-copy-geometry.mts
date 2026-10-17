import mysql from 'mysql2/promise';
const db=await mysql.createConnection(process.env.DATABASE_URL!);
try {
 const [x]=await db.query(`SELECT COUNT(*) AS totalRows, SUM(geometryWidth IS NOT NULL AND geometryHeight IS NOT NULL AND geometryDepth IS NOT NULL) AS rowsWithGeometry, SUM(supplierDescription REGEXP 'AltaEuro|U\\.?S\\.?[[:space:]]*Cabinet|Spec Book|manufacturer') AS badCopy FROM distributor_skus s JOIN distributors d ON d.id=s.distributorId WHERE d.code='AEF' AND s.isPublished=1 AND s.isAvailable=1`) as any[];
 console.log(JSON.stringify(x,null,2));
} finally { await db.end(); }
