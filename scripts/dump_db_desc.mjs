import "dotenv/config";
import mysql from "mysql2/promise";
import fs from "node:fs";

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute(
  `SELECT masterCode, description FROM cabinets WHERE description IS NOT NULL AND description <> '' ORDER BY masterCode`
);
await conn.end();

const norm = (c) => (c ? String(c).toUpperCase().replace(/[\s\-_.]+/g, "") : "");
const map = {};
for (const r of rows) {
  const k = norm(r.masterCode);
  if (k) map[k] = String(r.description).trim();
}
fs.writeFileSync("/home/ubuntu/db_desc_map.json", JSON.stringify(map, null, 0));
console.log(`DB cabinet-detail descriptions: ${rows.length} rows -> ${Object.keys(map).length} codes`);
console.log("Sample:");
for (const k of Object.keys(map).slice(0, 8)) console.log(`  ${k}: ${JSON.stringify(map[k])}`);
