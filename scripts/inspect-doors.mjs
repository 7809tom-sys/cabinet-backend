import "dotenv/config";
import mysql from "mysql2/promise";
import fs from "node:fs";
const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.query(
  `SELECT masterCode, description, category, subCategory, numberOfDoors, numberOfDrawers, graphicType, width
   FROM cabinets WHERE category='Wall' ORDER BY masterCode LIMIT 40`,
);
fs.writeFileSync("/tmp/walls.json", JSON.stringify(rows, null, 2));
console.log("WROTE", rows.length);
await conn.end();
