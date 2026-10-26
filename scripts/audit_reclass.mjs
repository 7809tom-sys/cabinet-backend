// Full catalog audit for reclassification. Dumps every row to a JSON + a flat txt.
import mysql from 'mysql2/promise';
import fs from 'node:fs';

const url = process.env.DATABASE_URL;
if (!url) { console.error('No DATABASE_URL'); process.exit(1); }

const conn = await mysql.createConnection(url);
const [rows] = await conn.query(
  `SELECT id, masterCode, category, subCategory, description, graphicType, numberOfDoors, numberOfDrawers
   FROM cabinets ORDER BY category, masterCode`
);
await conn.end();

fs.writeFileSync('/home/ubuntu/catalog_audit.json', JSON.stringify(rows, null, 2));
const lines = rows.map(r => `${r.id}\t${r.masterCode}\t${r.category}\t${r.subCategory || ''}\t${r.description}`);
fs.writeFileSync('/home/ubuntu/catalog_audit.txt', lines.join('\n'));
console.log(`Wrote ${rows.length} rows to catalog_audit.json / .txt`);

// Quick category tally
const byCat = {};
for (const r of rows) byCat[r.category] = (byCat[r.category]||0)+1;
console.log('By category:', byCat);
