import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute(`
  SELECT id, styleCode, ourName, featuredLabel, roomSceneImageUrl, doorSampleImageUrl, thumbnailImageUrl
  FROM door_styles
  ORDER BY ourName
`);
await conn.end();

console.log('Total styles:', rows.length);
const missing = rows.filter(r => !r.roomSceneImageUrl);
const hasScene = rows.filter(r => r.roomSceneImageUrl);
console.log('Has room scene:', hasScene.length);
console.log('Missing room scene:', missing.length);

console.log('\nMISSING ROOM SCENES:');
missing.forEach(r => console.log(r.id, r.styleCode, '|', r.ourName || r.featuredLabel || '(no name)', '| doorSample:', r.doorSampleImageUrl ? 'YES' : 'NO'));

console.log('\nHAS ROOM SCENES:');
hasScene.forEach(r => console.log(r.id, r.styleCode, '|', r.ourName || r.featuredLabel || '(no name)', '|', (r.roomSceneImageUrl || '').substring(0, 80)));
