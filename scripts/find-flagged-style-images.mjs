import "dotenv/config";
import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) { console.error("No DATABASE_URL"); process.exit(1); }
const conn = await mysql.createConnection(url);

const [rows] = await conn.query(
  `SELECT id, styleCode, ourName, distributorName, doorStyle,
          doorSampleImageUrl, roomSceneImageUrl, thumbnailImageUrl
   FROM door_styles
   WHERE ourName LIKE '%Ivor%' OR distributorName LIKE '%Ivor%'
      OR ourName LIKE '%Shaker Iv%'
      OR ourName LIKE '%Onyx%' OR distributorName LIKE '%Onyx%'
      OR ourName LIKE '%Obsidian%' OR distributorName LIKE '%Obsidian%'
      OR ourName LIKE '%Forge%' OR distributorName LIKE '%Forge%'
   ORDER BY ourName`
);

for (const r of rows) {
  console.log("─".repeat(70));
  console.log(`#${r.id}  ${r.ourName}  (dist: ${r.distributorName})  [${r.styleCode}] ${r.doorStyle ?? ""}`);
  console.log("  door:  ", r.doorSampleImageUrl || "(none)");
  console.log("  room:  ", r.roomSceneImageUrl || "(none)");
  console.log("  thumb: ", r.thumbnailImageUrl || "(none)");
}
console.log("─".repeat(70));
console.log(`Matched ${rows.length} styles`);
await conn.end();
