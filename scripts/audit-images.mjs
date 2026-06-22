import 'dotenv/config';
import mysql from 'mysql2/promise';
import fs from 'fs';

const url = process.env.DATABASE_URL;
const conn = await mysql.createConnection(url);
const [rows] = await conn.query(
  "SELECT id, styleCode, ourName, distributorName, doorStyle, color, woodSpecies, roomSceneImageUrl, doorSampleImageUrl FROM door_styles ORDER BY ourName"
);
const isReal = (u) => !!u && (/^https?:\/\//.test(u) || u.startsWith('/manus-storage/'));
const out = rows.map((r) => ({
  ...r,
  hasRoom: isReal(r.roomSceneImageUrl),
  hasDoor: isReal(r.doorSampleImageUrl),
}));
fs.writeFileSync(
  '/home/ubuntu/cabinet-dealz/scripts/image-audit.json',
  JSON.stringify(out, null, 2)
);
const noRoom = out.filter((r) => !r.hasRoom);
const noDoor = out.filter((r) => !r.hasDoor);
console.log('TOTAL', out.length);
console.log('HAS REAL ROOM', out.filter((r) => r.hasRoom).length);
console.log('HAS REAL DOOR', out.filter((r) => r.hasDoor).length);
console.log('\nMISSING ROOM SCENE (' + noRoom.length + '):');
noRoom.forEach((r) =>
  console.log('  -', r.ourName, '<=', r.distributorName)
);
console.log('\nMISSING DOOR (' + noDoor.length + '):');
noDoor.forEach((r) => console.log('  -', r.ourName, '<=', r.distributorName));
await conn.end();
