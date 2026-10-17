import mysql from 'mysql2/promise';
const db=await mysql.createConnection(process.env.DATABASE_URL!);
try {
 const [r]=await db.query(`SELECT c.masterCode,c.description,c.numberOfDoors,c.numberOfDrawers,c.graphicType,o.configJson,o.width,o.height,o.depth
 FROM cabinets c JOIN distributors d ON d.code='AEF' JOIN distributor_cabinet_overrides o ON o.distributorId=d.id AND o.cabinetId=c.id
 WHERE c.masterCode REGEXP '^W[0-9]+(1224|1524|1824|2324)$' ORDER BY c.masterCode`);
 console.log(JSON.stringify(r,null,2));
} finally { await db.end(); }
