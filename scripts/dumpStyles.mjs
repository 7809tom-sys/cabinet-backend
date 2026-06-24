import fs from "node:fs";
import mysql from "mysql2/promise";

function loadEnv() {
  const txt = fs.readFileSync("/home/ubuntu/cabinet-dealz/.env", "utf8");
  for (const line of txt.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) {
      let v = m[2];
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  }
}
loadEnv();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const conn = await mysql.createConnection(url);
const [rows] = await conn.execute(
  `SELECT id, ourName, doorStyle, woodSpecies, finish, color, doorPanelType, overlayType,
          doorSampleImageUrl, roomSceneImageUrl, thumbnailImageUrl
   FROM door_styles WHERE isActive = 1 ORDER BY ourName`
);
await conn.end();

fs.writeFileSync(
  "/home/ubuntu/cabinet-dealz/scripts/styles.json",
  JSON.stringify(rows, null, 2)
);
console.log(`Wrote ${rows.length} styles`);
