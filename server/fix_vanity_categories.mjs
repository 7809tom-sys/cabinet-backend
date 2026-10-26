/**
 * Fix VS* (Vanity Sink) cabinets that are miscategorized as Base instead of Vanity.
 * Also fix any other vanity-type cabinets with wrong categories.
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });
const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Find all VS*, VSD*, V3*DL, V3*DR, ADA-VS* cabinets that are NOT in Vanity category
const [wrongCat] = await conn.execute(
  `SELECT id, masterCode, description, category, subCategory
   FROM cabinets WHERE isActive = 1
   AND (
     masterCode REGEXP '^(VS|VSD|ADA-VS|ADA-VSD|V[0-9])'
     OR description LIKE '%Vanity%'
   )
   AND category NOT IN ('Vanity', 'Vanity Base')
   ORDER BY masterCode`
);

console.log(`Found ${wrongCat.length} vanity cabinets with wrong category:`);
wrongCat.forEach(r => console.log(`  [${r.id}] ${r.masterCode} | ${r.category}/${r.subCategory} | ${r.description?.substring(0, 60)}`));

if (wrongCat.length > 0) {
  const ids = wrongCat.map(r => r.id);
  const [fix] = await conn.execute(
    `UPDATE cabinets SET category = 'Vanity', subCategory = 'Vanity Base'
     WHERE id IN (${ids.join(',')})`
  );
  console.log(`\nFixed ${fix.affectedRows} cabinets -> category=Vanity, subCategory=Vanity Base`);
}

// Also check: are there any ADA-VS* still in wrong category?
const [adaVanity] = await conn.execute(
  `SELECT id, masterCode, category FROM cabinets 
   WHERE isActive = 1 AND masterCode LIKE 'ADA-VS%' AND category != 'Vanity'`
);
if (adaVanity.length > 0) {
  console.log(`\nADA-VS* still wrong: ${adaVanity.length}`);
  const ids = adaVanity.map(r => r.id);
  await conn.execute(
    `UPDATE cabinets SET category = 'Vanity', subCategory = 'ADA Vanity Base'
     WHERE id IN (${ids.join(',')})`
  );
  console.log(`Fixed ${adaVanity.length} ADA vanity cabinets`);
}

// Verify Floral Grey vanity count
const [fgVanity] = await conn.execute(
  `SELECT c.masterCode, c.category, c.subCategory
   FROM distributor_skus ds
   JOIN cabinets c ON c.id = ds.cabinetId
   WHERE ds.styleId = 180021 AND c.category = 'Vanity'
   ORDER BY c.masterCode`
);
console.log(`\nFloral Grey vanity cabinets (${fgVanity.length}):`);
fgVanity.forEach(r => console.log(`  ${r.masterCode} | ${r.category}/${r.subCategory}`));

await conn.end();
