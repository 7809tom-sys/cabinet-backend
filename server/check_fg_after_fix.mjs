import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Updated category breakdown
const [cats] = await conn.execute(
  `SELECT c.category, c.subCategory, COUNT(*) as cnt
   FROM distributor_skus ds
   JOIN cabinets c ON ds.cabinetId = c.id
   WHERE ds.styleId = 180021 AND ds.distributorId = 1
   GROUP BY c.category, c.subCategory
   ORDER BY c.category, c.subCategory`
);
console.log('Updated categories for FG:');
let total = 0;
cats.forEach(r => {
  console.log(`  ${r.category} / ${r.subCategory || 'null'}: ${r.cnt}`);
  total += r.cnt;
});
console.log('Total:', total);

// Check Wall cabinets with null subCategory - what are they?
const [wallNull] = await conn.execute(
  `SELECT c.masterCode, c.description, c.subCategory
   FROM distributor_skus ds
   JOIN cabinets c ON ds.cabinetId = c.id
   WHERE ds.styleId = 180021 AND ds.distributorId = 1 AND c.category = 'Wall' AND c.subCategory IS NULL
   ORDER BY c.masterCode LIMIT 20`
);
console.log('\nWall/null cabinets in FG:');
wallNull.forEach(r => console.log(`  ${r.masterCode}: ${r.description}`));

// Fix Wall cabinets with null subCategory
// W3012, W3015, W3018 = Bridge cabinets (short wall above fridge)
// W3312, W3612, W3615, W3618 = Bridge cabinets
// W3912 = Bridge cabinet
// W3024, W3324, W3624 = Deep wall cabinets (24" depth)
// W361224, W361824, W362424 = Corner wall cabinets (already fixed)

const bridgeCodes = ['W3012', 'W3015', 'W3018', 'W3312', 'W3612', 'W3615', 'W3618', 'W3912'];
const deepWallCodes = ['W3024', 'W3324', 'W3624'];

for (const code of bridgeCodes) {
  const [r] = await conn.execute(
    `UPDATE cabinets SET subCategory = 'Bridge Cabinet' WHERE masterCode = ? AND category = 'Wall'`,
    [code]
  );
  if (r.affectedRows > 0) console.log(`  Fixed bridge: ${code}`);
}

for (const code of deepWallCodes) {
  const [r] = await conn.execute(
    `UPDATE cabinets SET subCategory = 'Deep Wall Cabinet' WHERE masterCode = ? AND category = 'Wall'`,
    [code]
  );
  if (r.affectedRows > 0) console.log(`  Fixed deep wall: ${code}`);
}

// Also fix Filler category - these should be Accessory
const [fillerFix] = await conn.execute(
  `UPDATE cabinets SET category = 'Accessory', subCategory = 'Filler Panel' WHERE category = 'Filler'`
);
console.log(`\nFixed ${fillerFix.affectedRows} Filler cabinets -> Accessory/Filler Panel`);

// Final count
const [finalCats] = await conn.execute(
  `SELECT c.category, COUNT(*) as cnt
   FROM distributor_skus ds
   JOIN cabinets c ON ds.cabinetId = c.id
   WHERE ds.styleId = 180021 AND ds.distributorId = 1
   GROUP BY c.category
   ORDER BY c.category`
);
console.log('\nFinal category counts for FG:');
finalCats.forEach(r => console.log(`  ${r.category}: ${r.cnt}`));

await conn.end();
