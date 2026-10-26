/**
 * Fix isPublished=0 for all Milestone (distributorId=1) distributor_skus
 * that have a yourCost > 0. This is a systemic issue from the bulk import.
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Check current state
const [before] = await conn.execute(
  `SELECT isAvailable, isPublished, COUNT(*) as cnt 
   FROM distributor_skus WHERE distributorId = 1
   GROUP BY isAvailable, isPublished`
);
console.log('Before:');
before.forEach(r => console.log(`  isAvailable=${r.isAvailable}, isPublished=${r.isPublished}: ${r.cnt}`));

// Fix: set all Milestone SKUs with cost > 0 to isPublished=1 and isAvailable=1
const [fix] = await conn.execute(
  `UPDATE distributor_skus 
   SET isAvailable = 1, isPublished = 1 
   WHERE distributorId = 1 AND yourCost > 0`
);
console.log(`\nFixed ${fix.affectedRows} SKUs`);

// Also fix cabinets that are inactive but have active SKUs
const [fixCabs] = await conn.execute(
  `UPDATE cabinets SET isActive = 1
   WHERE id IN (
     SELECT DISTINCT cabinetId FROM distributor_skus 
     WHERE distributorId = 1 AND isPublished = 1 AND yourCost > 0
   ) AND isActive = 0`
);
console.log(`Fixed ${fixCabs.affectedRows} inactive cabinets`);

// Check after
const [after] = await conn.execute(
  `SELECT isAvailable, isPublished, COUNT(*) as cnt 
   FROM distributor_skus WHERE distributorId = 1
   GROUP BY isAvailable, isPublished`
);
console.log('\nAfter:');
after.forEach(r => console.log(`  isAvailable=${r.isAvailable}, isPublished=${r.isPublished}: ${r.cnt}`));

// Count by style to see how many items each style now has
const [bystyle] = await conn.execute(
  `SELECT dst.ourName, COUNT(DISTINCT ds.cabinetId) as cnt
   FROM distributor_skus ds
   JOIN door_styles dst ON ds.styleId = dst.id
   JOIN cabinets c ON ds.cabinetId = c.id
   WHERE ds.distributorId = 1 AND ds.isPublished = 1 AND c.isActive = 1
   GROUP BY dst.ourName
   ORDER BY dst.ourName`
);
console.log('\nItems per style (after fix):');
bystyle.forEach(r => console.log(`  ${r.ourName}: ${r.cnt}`));

await conn.end();
