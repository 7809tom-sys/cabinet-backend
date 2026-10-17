import mysql from 'mysql2/promise';
const db=await mysql.createConnection(process.env.DATABASE_URL!);
try {
 const [r]=await db.query(`SELECT c.id cabinetId, s.styleId FROM cabinets c JOIN distributor_skus s ON s.cabinetId=c.id JOIN distributors d ON d.id=s.distributorId WHERE c.masterCode='2DBID36' AND d.code='AEF' AND s.isPublished=1 AND s.isAvailable=1 LIMIT 1`) as any[];
 console.log(JSON.stringify(r[0],null,2));
} finally { await db.end(); }
