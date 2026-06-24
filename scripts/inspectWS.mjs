import mysql from 'mysql2/promise';
import fs from 'fs';

const DATABASE_URL = fs.readFileSync('/tmp/dburl.txt', 'utf8').trim().replace(/^DATABASE_URL=/, '');
const conn = await mysql.createConnection(DATABASE_URL);

const [rows] = await conn.query(
  `SELECT id, masterCode, description, category, subCategory, width, height, depth, placementType, graphicType, numberOfDoors
   FROM cabinets WHERE masterCode LIKE 'WS%' OR description LIKE '%skin%' OR subCategory LIKE '%Skin%' ORDER BY masterCode`
);
for (const r of rows) {
  console.log(`${r.masterCode} | "${r.description}" | cat=${r.category}/${r.subCategory} | ${r.width}W x ${r.height}H x ${r.depth}D | placement=${r.placementType} graphic=${r.graphicType} doors=${r.numberOfDoors}`);
}
await conn.end();
