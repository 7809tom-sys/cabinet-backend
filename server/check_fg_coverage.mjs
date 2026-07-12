/**
 * Diagnostic: Check how many FG SKUs are in distributor_skus vs how many
 * have a matching cabinet record (cabinetId not null).
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Total FG SKUs
const [total] = await conn.execute(
  `SELECT COUNT(*) as cnt FROM distributor_skus WHERE distributorSku LIKE 'FG-%' AND distributorId = 1`
);
console.log('Total FG SKUs in distributor_skus:', total[0].cnt);

// FG SKUs with a cabinetId
const [withCab] = await conn.execute(
  `SELECT COUNT(*) as cnt FROM distributor_skus WHERE distributorSku LIKE 'FG-%' AND distributorId = 1 AND cabinetId IS NOT NULL`
);
console.log('FG SKUs with cabinetId:', withCab[0].cnt);

// FG SKUs WITHOUT a cabinetId
const [withoutCab] = await conn.execute(
  `SELECT distributorSku, yourCost FROM distributor_skus 
   WHERE distributorSku LIKE 'FG-%' AND distributorId = 1 AND cabinetId IS NULL
   ORDER BY distributorSku`
);
console.log('\nFG SKUs WITHOUT cabinetId (' + withoutCab.length + '):');
withoutCab.forEach(r => console.log(' ', r.distributorSku, '@ $' + r.yourCost));

// Check what cabinets table has for some of these base codes
const sampleMissing = withoutCab.slice(0, 10).map(r => r.distributorSku.replace('FG-', ''));
if (sampleMissing.length > 0) {
  console.log('\nChecking cabinets table for these base codes:');
  for (const code of sampleMissing) {
    const [cabs] = await conn.execute(
      `SELECT id, masterCode, description, category FROM cabinets WHERE masterCode = ? LIMIT 1`,
      [code]
    );
    if (cabs.length > 0) {
      console.log(`  ${code} -> Found: id=${cabs[0].id}, cat=${cabs[0].category}`);
    } else {
      console.log(`  ${code} -> NOT FOUND in cabinets`);
    }
  }
}

await conn.end();
