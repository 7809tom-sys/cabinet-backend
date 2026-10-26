import mysql from 'mysql2/promise';
import fs from 'fs';

const DATABASE_URL = fs.readFileSync('/tmp/dburl.txt', 'utf8').trim().replace(/^DATABASE_URL=/, '');
const conn = await mysql.createConnection(DATABASE_URL);

// 1) Door styles that are Hickory / Sylvan Rust / RH
const [styles] = await conn.query(
  `SELECT id, distributorId, styleCode, ourName, distributorName, woodSpecies, finish, color FROM door_styles WHERE id IN (30021, 30062) OR LOWER(ourName) LIKE '%hickory%' OR LOWER(ourName) LIKE '%sylvan%' OR LOWER(ourName) LIKE '%rust%' OR LOWER(woodSpecies) LIKE '%hickory%' OR LOWER(distributorName) LIKE '%hickory%'`
);
console.log('=== Hickory / Sylvan Rust door styles ===');
for (const s of styles) {
  console.log(JSON.stringify(s));
}

// door_styles columns
const [dcols] = await conn.query(`SHOW COLUMNS FROM door_styles`);
console.log('\n=== door_styles columns ===');
console.log(dcols.map(c => c.Field).join(', '));

// 2) All skin-panel cabinets (the products)
const [skins] = await conn.query(
  `SELECT id, masterCode, description, category, subCategory, width, height, depth, placementType, graphicType
   FROM cabinets WHERE subCategory LIKE '%Skin%' OR description LIKE '%Skin%' OR description LIKE '%Panel%' ORDER BY subCategory, masterCode`
);
console.log('\n=== skin/panel products (count ' + skins.length + ') ===');
for (const r of skins) {
  console.log(`${r.masterCode} | "${r.description}" | ${r.category}/${r.subCategory} | ${r.width}x${r.height}x${r.depth} | place=${r.placementType} g=${r.graphicType}`);
}

await conn.end();
