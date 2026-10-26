import 'dotenv/config';
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.query(
  "SELECT ourName, roomSceneImageUrl, doorSampleImageUrl FROM door_styles WHERE ourName IN ('Lumina White','Oxford Sage','Oxford Toffee','Virid Echo','Aero Obsidian') ORDER BY ourName"
);
for (const r of rows) {
  console.log('=== ' + r.ourName + ' ===');
  console.log('  room: ' + JSON.stringify(r.roomSceneImageUrl));
  console.log('  door: ' + JSON.stringify(r.doorSampleImageUrl));
}
await conn.end();
