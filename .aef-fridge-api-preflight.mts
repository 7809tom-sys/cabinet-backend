import mysql from 'mysql2/promise';
const db=await mysql.createConnection(process.env.DATABASE_URL!);
const [rows]:any=await db.query(`SELECT c.masterCode,c.description,c.numberOfDoors,c.numberOfDrawers,o.configJson,o.geometryWidth,o.geometryHeight,o.geometryDepth,o.note FROM cabinets c JOIN distributors d ON d.code='AEF' JOIN distributor_cabinet_overrides o ON o.distributorId=d.id AND o.cabinetId=c.id WHERE c.masterCode IN ('W301224','W331224','W361224') ORDER BY c.masterCode`);
console.log(JSON.stringify(rows,null,2)); await db.end();
