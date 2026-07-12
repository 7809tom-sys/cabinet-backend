/**
 * Simulate what the catalog page query returns for Floral Grey.
 * Check how the server router queries cabinets for a style.
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Check what the catalog page shows - it likely queries by styleId
// Let's see the full breakdown
const [all] = await conn.execute(
  `SELECT c.masterCode, c.description, c.category, c.subCategory, c.placementType, ds.yourCost
   FROM distributor_skus ds
   JOIN cabinets c ON ds.cabinetId = c.id
   WHERE ds.styleId = 180021 AND ds.distributorId = 1
   ORDER BY c.category, c.subCategory, c.masterCode`
);

console.log('All FG SKUs (' + all.length + '):');
let currentCat = '';
all.forEach(r => {
  if (r.category !== currentCat) {
    currentCat = r.category;
    console.log(`\n=== ${r.category} ===`);
  }
  console.log(`  ${r.masterCode} | ${r.subCategory || 'null'} | ${r.placementType} | $${r.yourCost}`);
});

// Check the Accessory/null ones specifically - what masterCodes are they?
const [accNull] = await conn.execute(
  `SELECT c.masterCode, c.description, c.category, c.subCategory
   FROM distributor_skus ds
   JOIN cabinets c ON ds.cabinetId = c.id
   WHERE ds.styleId = 180021 AND ds.distributorId = 1 
   AND c.category = 'Accessory' AND c.subCategory IS NULL
   ORDER BY c.masterCode`
);
console.log('\n\nAccessory/null (' + accNull.length + '):');
accNull.forEach(r => console.log(`  ${r.masterCode}: ${r.description}`));

await conn.end();
