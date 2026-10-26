/**
 * Remove distId=3 non-prefixed duplicate SKUs from Floral Grey/White/Espresso styles.
 * These were incorrectly merged in — the proper FG-/FW-/FE- SKUs already cover these cabinets.
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });
const conn = await mysql.createConnection(process.env.DATABASE_URL);

const styles = [
  { styleId: 180021, prefix: 'FG-', name: 'Floral Grey' },
  { styleId: 180020, prefix: 'FW-', name: 'Floral White' },
  { styleId: 180022, prefix: 'FE-', name: 'Floral Espresso' },
];

for (const s of styles) {
  // Find non-prefixed distId=3 SKUs
  const [wrong] = await conn.execute(
    `SELECT id, distributorSku FROM distributor_skus 
     WHERE styleId = ? AND distributorId = 3 AND distributorSku NOT LIKE ?`,
    [s.styleId, s.prefix + '%']
  );
  console.log(`\n${s.name}: found ${wrong.length} distId=3 non-prefixed SKUs to remove`);
  
  if (wrong.length > 0) {
    const ids = wrong.map(r => r.id);
    const [del] = await conn.execute(
      `DELETE FROM distributor_skus WHERE id IN (${ids.join(',')})`
    );
    console.log(`  Deleted ${del.affectedRows} SKUs`);
  }
  
  // Verify remaining count
  const [remaining] = await conn.execute(
    `SELECT COUNT(*) as cnt FROM distributor_skus WHERE styleId = ?`, [s.styleId]
  );
  console.log(`  Remaining SKUs for ${s.name}: ${remaining[0].cnt}`);
}

// Also check other merged styles for the same issue
// All the 180xxx styles that had distId=3 merged in
const otherMerges = [
  { styleId: 180001, prefix: 'AG-',  name: 'Aston Green' },
  { styleId: 180002, prefix: 'LG-',  name: 'Lunar Gray' },
  { styleId: 180004, prefix: 'RW-',  name: 'Rustic Wood' },
  { styleId: 180005, prefix: 'AW-',  name: 'Aspen White' },
  { styleId: 180006, prefix: 'AC-',  name: 'Aspen Charcoal Gray' },
  { styleId: 180007, prefix: 'DDW-', name: 'Double Dove White' },
  { styleId: 180008, prefix: 'SD-',  name: 'Slim Dove White' },
  { styleId: 180009, prefix: 'SAG-', name: 'Slim Aston Green' },
  { styleId: 180010, prefix: 'SIB-', name: 'Slim Iron Black' },
  { styleId: 180011, prefix: 'SAO-', name: 'Slim Amber Oak' },
  { styleId: 180012, prefix: 'SWO-', name: 'Slim White Oak' },
  { styleId: 180013, prefix: 'HGW-', name: 'High Gloss White' },
  { styleId: 180014, prefix: 'HGG-', name: 'High Gloss Gray' },
  { styleId: 180015, prefix: 'MB-',  name: 'Matte Black' },
  { styleId: 180016, prefix: 'MG-',  name: 'Midnight Glass' },
  { styleId: 180018, prefix: 'CG-',  name: 'Crystal Glass' },
];

console.log('\n\nChecking other merged styles for distId=3 non-prefixed SKUs...');
for (const s of otherMerges) {
  const [wrong] = await conn.execute(
    `SELECT COUNT(*) as cnt FROM distributor_skus 
     WHERE styleId = ? AND distributorId = 3`,
    [s.styleId]
  );
  if (wrong[0].cnt > 0) {
    // Show what the distId=3 SKUs look like for this style
    const [sample] = await conn.execute(
      `SELECT distributorSku FROM distributor_skus WHERE styleId = ? AND distributorId = 3 LIMIT 3`,
      [s.styleId]
    );
    console.log(`  ${s.name} (${s.styleId}): ${wrong[0].cnt} distId=3 SKUs, e.g. ${sample.map(r => r.distributorSku).join(', ')}`);
  }
}

await conn.end();
