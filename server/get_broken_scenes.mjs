import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute(
  `SELECT styleCode, ourName, doorStyle, color, woodSpecies, finish 
   FROM door_styles 
   WHERE roomSceneImageUrl LIKE '%cloudfront%' 
      OR roomSceneImageUrl IS NULL 
      OR roomSceneImageUrl = '' 
   ORDER BY styleCode`
);
console.log(JSON.stringify(rows.map(r => ({
  code: r.styleCode, 
  name: r.ourName, 
  style: r.doorStyle, 
  color: r.color, 
  wood: r.woodSpecies, 
  finish: r.finish
})), null, 2));
await conn.end();
process.exit(0);
