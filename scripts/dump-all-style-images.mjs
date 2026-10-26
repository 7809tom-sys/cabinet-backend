import "dotenv/config";
import mysql from "mysql2/promise";
import fs from "fs";

const url = process.env.DATABASE_URL;
if (!url) { console.error("No DATABASE_URL"); process.exit(1); }
const conn = await mysql.createConnection(url);

const [rows] = await conn.query(
  `SELECT id, styleCode, ourName, distributorName, doorStyle, isActive,
          doorSampleImageUrl, roomSceneImageUrl, thumbnailImageUrl
   FROM door_styles
   ORDER BY ourName`
);

fs.writeFileSync("/home/ubuntu/style_images_all.json", JSON.stringify(rows, null, 2));
console.log(`Wrote ${rows.length} door styles to /home/ubuntu/style_images_all.json`);
// Quick stats
const active = rows.filter(r => r.isActive).length;
console.log(`Active: ${active} / ${rows.length}`);
await conn.end();
