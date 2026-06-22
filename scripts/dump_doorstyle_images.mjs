import 'dotenv/config';
import mysql from 'mysql2/promise';
const url = process.env.DATABASE_URL;
const conn = await mysql.createConnection(url);
const [rows] = await conn.execute(
  "SELECT styleCode, ourName, distributorName, doorStyle, finish, color, roomSceneImageUrl, doorSampleImageUrl, thumbnailImageUrl FROM door_styles ORDER BY ourName"
);
const fs = await import('fs');
const cols = ['styleCode','ourName','distributorName','doorStyle','finish','color','roomSceneImageUrl','doorSampleImageUrl','thumbnailImageUrl'];
const esc = v => v==null?'':('"'+String(v).replace(/"/g,'""')+'"');
const out = [cols.join(',')].concat(rows.map(r=>cols.map(c=>esc(r[c])).join(','))).join('\n');
fs.writeFileSync('exports/db_door_style_images.csv', out);
console.log('rows:', rows.length);
await conn.end();
