import mysql from 'mysql2/promise';
const db=await mysql.createConnection(process.env.DATABASE_URL!);
const [rows]=await db.query(`SELECT c.masterCode,c.description,c.category,c.subCategory,c.placementType,c.isNotCabinet,c.showInCatalog,c.showInDesigner,ds.distributorSku,ds.isPublished,ds.isAvailable FROM cabinets c JOIN distributor_skus ds ON ds.cabinetId=c.id JOIN distributors d ON d.id=ds.distributorId WHERE d.code='AEF' AND (c.masterCode REGEXP '^OF[0-9]+' OR ds.distributorSku REGEXP '^OF[0-9]+') ORDER BY c.masterCode,ds.distributorSku`);
console.log(JSON.stringify(rows,null,2));await db.end();
