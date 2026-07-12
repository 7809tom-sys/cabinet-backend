/**
 * Merge duplicate Floral style entries.
 * Distributor 3 entries (30040, 30041, 30042) are duplicates of Milestone entries.
 * Strategy: re-point any dist3 SKUs to the correct Milestone styleId, then delete the dup styles.
 * 
 * Merges:
 *   30041 "Floral Gray"     -> 180021 "Floral Grey"
 *   30040 "Floral White"    -> 180020 "Floral White"  
 *   30042 "Floral Expresso" -> 180022 "Floral Espresso"
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });
const conn = await mysql.createConnection(process.env.DATABASE_URL);

const merges = [
  { fromId: 30041, toId: 180021, name: 'Floral Grey' },
  { fromId: 30040, toId: 180020, name: 'Floral White' },
  { fromId: 30042, toId: 180022, name: 'Floral Espresso' },
];

for (const m of merges) {
  // Check what SKUs exist in the duplicate style
  const [skus] = await conn.execute(
    `SELECT COUNT(*) as cnt FROM distributor_skus WHERE styleId = ?`, [m.fromId]
  );
  console.log(`\n${m.name}: moving ${skus[0].cnt} SKUs from styleId ${m.fromId} -> ${m.toId}`);

  // Re-point SKUs to the canonical style
  if (skus[0].cnt > 0) {
    const [moved] = await conn.execute(
      `UPDATE distributor_skus SET styleId = ? WHERE styleId = ?`,
      [m.toId, m.fromId]
    );
    console.log(`  Moved ${moved.affectedRows} SKUs`);
  }

  // Check for any other references (door_style_images, corrections, etc.)
  const tables = ['door_style_images', 'door_style_corrections', 'cart_items', 'order_items'];
  for (const tbl of tables) {
    try {
      const [ref] = await conn.execute(
        `SELECT COUNT(*) as cnt FROM ${tbl} WHERE styleId = ?`, [m.fromId]
      );
      if (ref[0].cnt > 0) {
        await conn.execute(`UPDATE ${tbl} SET styleId = ? WHERE styleId = ?`, [m.toId, m.fromId]);
        console.log(`  Updated ${ref[0].cnt} rows in ${tbl}`);
      }
    } catch (e) {
      // Table may not exist or column name differs
    }
  }

  // Delete the duplicate style
  const [del] = await conn.execute(
    `DELETE FROM door_styles WHERE id = ?`, [m.fromId]
  );
  console.log(`  Deleted duplicate style [${m.fromId}]`);
}

// Verify final state
const [final] = await conn.execute(
  `SELECT ds.id, ds.ourName, ds.distributorId, COUNT(sk.id) as skuCount
   FROM door_styles ds
   LEFT JOIN distributor_skus sk ON sk.styleId = ds.id
   WHERE ds.ourName LIKE '%Floral%'
   GROUP BY ds.id ORDER BY ds.ourName`
);
console.log('\nFinal Floral styles:');
final.forEach(r => console.log(`  [${r.id}] "${r.ourName}" | distId=${r.distributorId} | SKUs=${r.skuCount}`));

await conn.end();
