/**
 * Merge all distId=3 duplicate style entries into their canonical Milestone (distId=1) entries.
 * The Milestone entry (180xxx IDs) is the source of truth.
 * distId=3 aliases are merged in — their SKUs re-pointed, then the dup style deleted.
 *
 * Merges (fromId -> toId):
 *   Exact name matches:
 *     30015 "Aston Green"       -> 180001
 *     30022 "Aspen White"       -> 180005
 *     30023 "Aspen Charcoal"    -> 180006  (alias of "Aspen Charcoal Gray")
 *     30025 "Double Dove White" -> 180007
 *     30027 "Slim Dove White"   -> 180008
 *     30028 "Slim Aston Green"  -> 180009
 *     30029 "Slim Iron Black"   -> 180010
 *     30030 "Slim Amber Oak"    -> 180011
 *     30031 "Slim White Oak"    -> 180012
 *     30032 "High Glossy White" -> 180013
 *     30033 "High Glossy Gray"  -> 180014
 *     30034 "Matte Black"       -> 180015
 *     30038 "Crystal Glass"     -> 180018
 *     30021 "Rustic Wood"       -> 180004
 *     30039 "Midnight Glass"    -> 180016
 *     30018 "Lunar Gray"        -> 180002
 *
 *   Styles in distId=3 with NO Milestone equivalent — keep as-is:
 *     30011 Shaker White, 30012 Shaker Gray, 30013 Shaker Expresso
 *     30014 Navy Blue, 30016 Iron Black, 30017 Smokey Ash
 *     30019 Sage Breeze, 30020 Aurum Vault, 30024 Double Smokey Gray
 *     30026 Charleston White, 30035 Matte Ivory, 30036 Oak Blonde
 *     30037 Oak Shade
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });
const conn = await mysql.createConnection(process.env.DATABASE_URL);

const merges = [
  { fromId: 30015, toId: 180001, label: 'Aston Green' },
  { fromId: 30022, toId: 180005, label: 'Aspen White' },
  { fromId: 30023, toId: 180006, label: 'Aspen Charcoal (-> Aspen Charcoal Gray)' },
  { fromId: 30025, toId: 180007, label: 'Double Dove White' },
  { fromId: 30027, toId: 180008, label: 'Slim Dove White' },
  { fromId: 30028, toId: 180009, label: 'Slim Aston Green' },
  { fromId: 30029, toId: 180010, label: 'Slim Iron Black' },
  { fromId: 30030, toId: 180011, label: 'Slim Amber Oak' },
  { fromId: 30031, toId: 180012, label: 'Slim White Oak' },
  { fromId: 30032, toId: 180013, label: 'High Glossy White (-> High Gloss White)' },
  { fromId: 30033, toId: 180014, label: 'High Glossy Gray (-> High Gloss Gray)' },
  { fromId: 30034, toId: 180015, label: 'Matte Black' },
  { fromId: 30038, toId: 180018, label: 'Crystal Glass' },
  { fromId: 30021, toId: 180004, label: 'Rustic Wood' },
  { fromId: 30039, toId: 180016, label: 'Midnight Glass' },
  { fromId: 30018, toId: 180002, label: 'Lunar Gray' },
  { fromId: 180003, toId: 180003, label: 'Treasure Chest (already canonical, skip)' }, // already correct
];

// Also check Treasure Chest
const [tc] = await conn.execute(
  `SELECT id, ourName, distributorId FROM door_styles WHERE ourName = 'Treasure Chest' ORDER BY id`
);
console.log('Treasure Chest entries:', tc.map(r => `[${r.id}] distId=${r.distributorId}`).join(', '));

// Find the distId=3 Treasure Chest if any
const tcDup = tc.find(r => r.distributorId === 3 || r.id < 180000);
const tcCanon = tc.find(r => r.id === 180003);
if (tcDup && tcCanon && tcDup.id !== tcCanon.id) {
  merges.push({ fromId: tcDup.id, toId: 180003, label: 'Treasure Chest dup' });
}

const relatedTables = [
  'door_style_images',
  'door_style_corrections', 
  'cart_items',
  'order_items',
  'design_cabinets',
];

let totalMerged = 0;

for (const m of merges) {
  if (m.fromId === m.toId) continue;
  
  // Check if fromId exists
  const [exists] = await conn.execute(`SELECT id FROM door_styles WHERE id = ?`, [m.fromId]);
  if (exists.length === 0) {
    console.log(`\n${m.label}: [${m.fromId}] not found, skipping`);
    continue;
  }

  // Count SKUs to move
  const [skus] = await conn.execute(
    `SELECT COUNT(*) as cnt FROM distributor_skus WHERE styleId = ?`, [m.fromId]
  );
  console.log(`\n${m.label}: moving ${skus[0].cnt} SKUs [${m.fromId}] -> [${m.toId}]`);

  if (skus[0].cnt > 0) {
    // Check for duplicate SKUs (same distributorSku already in toId)
    const [dups] = await conn.execute(
      `SELECT ds1.id, ds1.distributorSku FROM distributor_skus ds1
       WHERE ds1.styleId = ? AND EXISTS (
         SELECT 1 FROM distributor_skus ds2 
         WHERE ds2.styleId = ? AND ds2.distributorSku = ds1.distributorSku
       )`,
      [m.fromId, m.toId]
    );
    if (dups.length > 0) {
      console.log(`  Removing ${dups.length} duplicate SKUs before merge`);
      const dupIds = dups.map(d => d.id);
      await conn.execute(
        `DELETE FROM distributor_skus WHERE id IN (${dupIds.join(',')})`,
      );
    }
    
    // Move remaining SKUs
    const [moved] = await conn.execute(
      `UPDATE distributor_skus SET styleId = ? WHERE styleId = ?`,
      [m.toId, m.fromId]
    );
    console.log(`  Moved ${moved.affectedRows} SKUs`);
    totalMerged += moved.affectedRows;
  }

  // Update related tables
  for (const tbl of relatedTables) {
    try {
      const [ref] = await conn.execute(
        `SELECT COUNT(*) as cnt FROM ${tbl} WHERE styleId = ?`, [m.fromId]
      );
      if (ref[0].cnt > 0) {
        await conn.execute(`UPDATE ${tbl} SET styleId = ? WHERE styleId = ?`, [m.toId, m.fromId]);
        console.log(`  Updated ${ref[0].cnt} rows in ${tbl}`);
      }
    } catch (e) { /* table/column may not exist */ }
  }

  // Delete the duplicate style
  await conn.execute(`DELETE FROM door_styles WHERE id = ?`, [m.fromId]);
  console.log(`  Deleted duplicate style [${m.fromId}]`);
}

console.log(`\nTotal SKUs merged: ${totalMerged}`);

// Final state
const [final] = await conn.execute(
  `SELECT ds.id, ds.ourName, ds.distributorId, COUNT(sk.id) as skuCount
   FROM door_styles ds
   LEFT JOIN distributor_skus sk ON sk.styleId = ds.id
   GROUP BY ds.id
   ORDER BY ds.ourName`
);
console.log('\nFinal style list:');
final.forEach(r => console.log(`  [${r.id}] distId=${r.distributorId} | "${r.ourName}" | SKUs=${r.skuCount}`));

await conn.end();
