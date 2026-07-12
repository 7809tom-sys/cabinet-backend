/**
 * Diagnose why only 43 items show for Floral Grey in the catalog.
 * The portal has 117 SKUs, DB has 148 FG SKUs, but only 43 show.
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Get the styleId for Floral Grey
const [styles] = await conn.execute(
  `SELECT id, ourName FROM door_styles WHERE id = 180021`
);
console.log('Style:', styles[0]);

// Count distinct cabinets linked to FG style
const [cabCount] = await conn.execute(
  `SELECT COUNT(DISTINCT ds.cabinetId) as cnt 
   FROM distributor_skus ds 
   WHERE ds.styleId = 180021 AND ds.distributorId = 1 AND ds.cabinetId IS NOT NULL`
);
console.log('Distinct cabinets linked to FG style:', cabCount[0].cnt);

// What categories are these cabinets in?
const [cats] = await conn.execute(
  `SELECT c.category, c.subCategory, COUNT(*) as cnt
   FROM distributor_skus ds
   JOIN cabinets c ON ds.cabinetId = c.id
   WHERE ds.styleId = 180021 AND ds.distributorId = 1
   GROUP BY c.category, c.subCategory
   ORDER BY c.category, c.subCategory`
);
console.log('\nCategories breakdown:');
cats.forEach(r => console.log(`  ${r.category} / ${r.subCategory}: ${r.cnt}`));

// Check if the catalog query uses a JOIN that might filter things out
// Let's see what the actual query returns for FG
const [sample] = await conn.execute(
  `SELECT ds.distributorSku, ds.yourCost, c.masterCode, c.category, c.subCategory, c.placementType
   FROM distributor_skus ds
   JOIN cabinets c ON ds.cabinetId = c.id
   WHERE ds.styleId = 180021 AND ds.distributorId = 1
   ORDER BY ds.distributorSku
   LIMIT 20`
);
console.log('\nSample FG SKUs with cabinet info:');
sample.forEach(r => console.log(`  ${r.distributorSku} | ${r.masterCode} | ${r.category} | ${r.subCategory} | ${r.placementType} | $${r.yourCost}`));

// Check total count
const [totalLinked] = await conn.execute(
  `SELECT COUNT(*) as cnt
   FROM distributor_skus ds
   JOIN cabinets c ON ds.cabinetId = c.id
   WHERE ds.styleId = 180021 AND ds.distributorId = 1`
);
console.log('\nTotal FG SKUs with valid cabinet join:', totalLinked[0].cnt);

// Now check what the catalog page query might look like
// The catalog probably groups by cabinet and shows unique cabinets
// Let's see how many unique masterCodes are there
const [uniqueCodes] = await conn.execute(
  `SELECT COUNT(DISTINCT c.masterCode) as cnt
   FROM distributor_skus ds
   JOIN cabinets c ON ds.cabinetId = c.id
   WHERE ds.styleId = 180021 AND ds.distributorId = 1`
);
console.log('Unique masterCodes for FG:', uniqueCodes[0].cnt);

await conn.end();
