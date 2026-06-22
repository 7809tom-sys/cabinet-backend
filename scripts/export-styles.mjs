// One-off: export all door styles (internal + distributor names) to JSON.
import "dotenv/config";
import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("No DATABASE_URL in env");
  process.exit(1);
}
const conn = await mysql.createConnection(url);
const [rows] = await conn.query(
  `SELECT id, styleCode, ourName, distributorName, doorStyle, woodSpecies, color, finish, doorSampleImageUrl, roomSceneImageUrl
   FROM door_styles ORDER BY ourName`,
);
const fs = await import("node:fs");
fs.writeFileSync("door_styles.json", JSON.stringify(rows, null, 2));
console.log("COUNT", rows.length);
for (const r of rows) {
  console.log(`${r.id}\t${r.ourName}\t<=\t${r.distributorName}\t|\t${r.doorStyle}\t|\t${r.color}`);
}
await conn.end();
