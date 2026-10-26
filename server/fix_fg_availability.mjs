import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Check isAvailable and isPublished for FG SKUs
const [avail] = await conn.execute(
  `SELECT isAvailable, isPublished, COUNT(*) as cnt 
   FROM distributor_skus 
   WHERE distributorSku LIKE 'FG-%' AND distributorId = 1
   GROUP BY isAvailable, isPublished`
);
console.log('FG availability breakdown:');
avail.forEach(r => console.log(`  isAvailable=${r.isAvailable}, isPublished=${r.isPublished}: ${r.cnt}`));

// Also check isActive on cabinets
const [cabActive] = await conn.execute(
  `SELECT c.isActive, COUNT(*) as cnt
   FROM distributor_skus ds
   JOIN cabinets c ON ds.cabinetId = c.id
   WHERE ds.distributorSku LIKE 'FG-%' AND ds.distributorId = 1
   GROUP BY c.isActive`
);
console.log('\nCabinet isActive breakdown for FG:');
cabActive.forEach(r => console.log(`  isActive=${r.isActive}: ${r.cnt}`));

// Fix: set all FG SKUs to isAvailable=1 and isPublished=1
const [fix1] = await conn.execute(
  `UPDATE distributor_skus SET isAvailable = 1, isPublished = 1 
   WHERE distributorSku LIKE 'FG-%' AND distributorId = 1`
);
console.log(`\nFixed isAvailable/isPublished for ${fix1.affectedRows} FG SKUs`);

// Fix: set all cabinets linked to FG to isActive=1
const [fix2] = await conn.execute(
  `UPDATE cabinets SET isActive = 1
   WHERE id IN (
     SELECT DISTINCT cabinetId FROM distributor_skus 
     WHERE distributorSku LIKE 'FG-%' AND distributorId = 1
   )`
);
console.log(`Fixed isActive for ${fix2.affectedRows} cabinets`);

// Now simulate the catalog query count
const [count] = await conn.execute(
  `SELECT COUNT(DISTINCT ds.cabinetId) as cnt
   FROM distributor_skus ds
   JOIN cabinets c ON ds.cabinetId = c.id
   WHERE ds.styleId = 180021 AND ds.distributorId = 1
   AND ds.isAvailable = 1 AND ds.isPublished = 1 AND c.isActive = 1`
);
console.log(`\nCatalog would now show ${count[0].cnt} distinct cabinets for FG`);

// Breakdown by category
const [cats] = await conn.execute(
  `SELECT c.category, COUNT(DISTINCT ds.cabinetId) as cnt
   FROM distributor_skus ds
   JOIN cabinets c ON ds.cabinetId = c.id
   WHERE ds.styleId = 180021 AND ds.distributorId = 1
   AND ds.isAvailable = 1 AND ds.isPublished = 1 AND c.isActive = 1
   GROUP BY c.category ORDER BY c.category`
);
console.log('By category:');
cats.forEach(r => console.log(`  ${r.category}: ${r.cnt}`));

await conn.end();
