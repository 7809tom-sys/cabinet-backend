/**
 * Fix remaining Accessory/null cabinets - these are likely ADA wall cabinets
 * and other items that need proper categorization.
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Show all Accessory/null cabinets linked to FG
const [accNull] = await conn.execute(
  `SELECT DISTINCT c.masterCode, c.description, c.category, c.subCategory, c.placementType
   FROM distributor_skus ds
   JOIN cabinets c ON ds.cabinetId = c.id
   WHERE ds.styleId = 180021 AND ds.distributorId = 1 
   AND c.category = 'Accessory' AND c.subCategory IS NULL
   ORDER BY c.masterCode`
);
console.log('Accessory/null cabinets in FG (' + accNull.length + '):');
accNull.forEach(r => console.log(`  ${r.masterCode}: ${r.description}`));

// Fix them based on masterCode patterns
let fixed = 0;

for (const cab of accNull) {
  const code = cab.masterCode;
  const desc = (cab.description || '').toLowerCase();
  
  let newCat = null, newSub = null, newPlacement = null;
  
  if (code.startsWith('ADA-W')) {
    // ADA wall cabinets
    newCat = 'Wall';
    newSub = 'Standard Wall';
    newPlacement = 'wall';
  } else if (code.startsWith('ADA-SB') || code.match(/^ADA-.*SB/)) {
    // ADA sink base
    newCat = 'Base';
    newSub = 'Sink Base';
    newPlacement = 'base';
  } else if (code.startsWith('ADA-B')) {
    // ADA base
    newCat = 'Base';
    newSub = 'Single Door Base';
    newPlacement = 'base';
  } else if (desc.includes('wall') || code.match(/^W\d/)) {
    newCat = 'Wall';
    newSub = 'Standard Wall';
    newPlacement = 'wall';
  } else if (desc.includes('base') || desc.includes('drawer')) {
    newCat = 'Base';
    newSub = 'Standard Base';
    newPlacement = 'base';
  } else if (desc.includes('vanity')) {
    newCat = 'Vanity';
    newSub = 'Vanity Sink Base';
    newPlacement = 'base';
  }
  
  if (newCat) {
    const [r] = await conn.execute(
      `UPDATE cabinets SET category = ?, subCategory = ?, placementType = ? WHERE masterCode = ?`,
      [newCat, newSub, newPlacement, code]
    );
    if (r.affectedRows > 0) {
      fixed++;
      console.log(`  Fixed: ${code} -> ${newCat}/${newSub}`);
    }
  } else {
    console.log(`  UNHANDLED: ${code} - ${cab.description}`);
  }
}

console.log(`\nFixed ${fixed} cabinets`);

// Final check
const [finalCats] = await conn.execute(
  `SELECT c.category, c.subCategory, COUNT(*) as cnt
   FROM distributor_skus ds
   JOIN cabinets c ON ds.cabinetId = c.id
   WHERE ds.styleId = 180021 AND ds.distributorId = 1
   GROUP BY c.category, c.subCategory
   ORDER BY c.category, c.subCategory`
);
console.log('\nFinal breakdown for FG:');
finalCats.forEach(r => console.log(`  ${r.category} / ${r.subCategory || 'null'}: ${r.cnt}`));

await conn.end();
