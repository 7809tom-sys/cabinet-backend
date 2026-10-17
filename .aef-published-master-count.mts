import mysql from 'mysql2/promise';
const db=await mysql.createConnection(process.env.DATABASE_URL!);
const [rows]:any=await db.query(`SELECT DISTINCT c.id,c.masterCode,c.description,c.category,c.subCategory,c.showInCatalog,c.showInDesigner FROM distributor_skus s JOIN cabinets c ON c.id=s.cabinetId JOIN distributors d ON d.id=s.distributorId WHERE d.code='AEF' AND s.isPublished=1 AND s.isAvailable=1 ORDER BY c.masterCode`);
console.log('count',rows.length);
console.log(JSON.stringify(rows,null,2)); await db.end();
