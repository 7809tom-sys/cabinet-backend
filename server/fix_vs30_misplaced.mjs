/**
 * Investigate VS30 showing under Floral Grey base cabinets.
 * Also check for any other vanity/wrong-style SKUs under FG.
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });
const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Find VS30 cabinet and its SKUs
const [vs30] = await conn.execute(
  `SELECT c.id, c.masterCode, c.description, c.category, c.subCategory,
          ds.id as skuId, ds.distributorSku, ds.styleId, dst.ourName as styleName, ds.distributorId
   FROM cabinets c
   JOIN distributor_skus ds ON ds.cabinetId = c.id
   JOIN door_styles dst ON dst.id = ds.styleId
   WHERE c.masterCode = 'VS30'
   ORDER BY ds.styleId`
);
console.log('VS30 SKUs:');
vs30.forEach(r => console.log(`  skuId=${r.skuId} | distributorSku="${r.distributorSku}" | styleId=${r.styleId} | style="${r.styleName}" | distId=${r.distributorId}`));

// Check what styles VS30 is linked to
const styleIds = [...new Set(vs30.map(r => r.styleId))];
console.log('\nVS30 linked to styleIds:', styleIds);

// The issue: VS30 from distId=3 (Oxford Mist) was merged into FG (180021) during the dedup.
// We need to find which SKUs were incorrectly merged.

// Show all FG (180021) SKUs that don't start with FG-
const [wrongFG] = await conn.execute(
  `SELECT ds.id, ds.distributorSku, ds.distributorId, c.masterCode, c.description, c.category
   FROM distributor_skus ds
   JOIN cabinets c ON c.id = ds.cabinetId
   WHERE ds.styleId = 180021
   AND ds.distributorSku NOT LIKE 'FG-%'
   ORDER BY ds.distributorSku`
);
console.log(`\nNon-FG SKUs under Floral Grey (${wrongFG.length}):`);
wrongFG.forEach(r => console.log(`  [${r.id}] "${r.distributorSku}" | distId=${r.distributorId} | masterCode=${r.masterCode} | ${r.category}`));

// Also check FW (180020) and FE (180022) for wrong SKUs
for (const [styleId, prefix, name] of [[180020, 'FW-', 'Floral White'], [180022, 'FE-', 'Floral Espresso']]) {
  const [wrong] = await conn.execute(
    `SELECT ds.id, ds.distributorSku, ds.distributorId, c.masterCode
     FROM distributor_skus ds
     JOIN cabinets c ON c.id = ds.cabinetId
     WHERE ds.styleId = ? AND ds.distributorSku NOT LIKE ?
     ORDER BY ds.distributorSku`,
    [styleId, prefix + '%']
  );
  if (wrong.length > 0) {
    console.log(`\nNon-${prefix} SKUs under ${name} (${wrong.length}):`);
    wrong.forEach(r => console.log(`  [${r.id}] "${r.distributorSku}" | distId=${r.distributorId} | masterCode=${r.masterCode}`));
  }
}

await conn.end();
