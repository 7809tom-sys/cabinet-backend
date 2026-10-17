import mysql from 'mysql2/promise';
const db=await mysql.createConnection(process.env.DATABASE_URL!);
const [cols]:any=await db.query('SHOW COLUMNS FROM distributor_cabinet_overrides');
console.log('OVERRIDE_COLUMNS',cols.map((r:any)=>r.Field).join(','));
const [rows]:any=await db.query(`SELECT c.id,c.masterCode,c.description,c.category,c.subCategory,c.numberOfDoors,c.numberOfDrawers,c.graphicType,o.width,o.height,o.depth,o.configJson,o.note FROM cabinets c JOIN distributors d ON d.code='AEF' JOIN distributor_cabinet_overrides o ON o.distributorId=d.id AND o.cabinetId=c.id WHERE c.masterCode REGEXP '^(W(30|33|36)[0-9]|T(OS|OD))' OR c.description LIKE '%Refrigerator%' OR c.description LIKE '%Oven%' ORDER BY c.masterCode`);
console.log(JSON.stringify(rows,null,2)); await db.end();
