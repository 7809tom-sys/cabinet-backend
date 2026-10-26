import mysql from 'mysql2/promise';
const db=await mysql.createConnection(process.env.DATABASE_URL!);
const [rows]=await db.query(`
 SELECT c.id,c.masterCode,c.description,c.category,c.numberOfDoors AS masterDoors,c.numberOfDrawers AS masterDrawers,
        o.configJson,o.width,o.height,o.depth,o.note
 FROM cabinets c
 JOIN distributor_cabinet_overrides o ON o.cabinetId=c.id
 JOIN distributors d ON d.id=o.distributorId
 WHERE LOWER(d.name) LIKE '%cabinet depot%'
   AND (c.masterCode IN ('W361224','W301224','W332424','TOS2DB3084','TOS2DB2484','TOSDB3084','T3DB3084') OR c.masterCode REGEXP '^(W[0-9]+(1224|2424)|TOS)')
 ORDER BY c.masterCode
`);
console.log(JSON.stringify(rows,null,2)); await db.end();
