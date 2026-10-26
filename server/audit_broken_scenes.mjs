import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute(`
  SELECT id, styleCode, ourName, featuredLabel, doorStyle, woodSpecies, finish, color,
         roomSceneImageUrl, doorSampleImageUrl, thumbnailImageUrl
  FROM door_styles
  WHERE roomSceneImageUrl LIKE '%cloudfront%'
     OR roomSceneImageUrl IS NULL
  ORDER BY ourName
`);
await conn.end();

console.log('Styles needing room scene images:', rows.length);
rows.forEach(r => {
  const name = r.ourName || r.featuredLabel || r.styleCode;
  const details = [r.doorStyle, r.woodSpecies, r.finish, r.color].filter(Boolean).join(', ');
  console.log(`ID:${r.id} | ${r.styleCode} | ${name} | ${details}`);
});
