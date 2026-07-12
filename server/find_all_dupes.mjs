import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });
const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Find styles with very similar names (same style, different distributors)
const [all] = await conn.execute(
  `SELECT ds.id, ds.ourName, ds.distributorId, COUNT(sk.id) as skuCount
   FROM door_styles ds
   LEFT JOIN distributor_skus sk ON sk.styleId = ds.id
   GROUP BY ds.id
   ORDER BY ds.ourName, ds.distributorId`
);

// Group by normalized name (lowercase, remove spaces)
const groups = {};
for (const row of all) {
  const key = row.ourName.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');
  if (!groups[key]) groups[key] = [];
  groups[key].push(row);
}

// Show groups with more than 1 entry
console.log('Potential duplicate styles:');
let dupeCount = 0;
for (const [key, entries] of Object.entries(groups)) {
  if (entries.length > 1) {
    dupeCount++;
    console.log(`\n  "${entries[0].ourName}" (${entries.length} entries):`);
    entries.forEach(e => console.log(`    [${e.id}] distId=${e.distributorId} | SKUs=${e.skuCount}`));
  }
}
if (dupeCount === 0) console.log('  None found!');

// Also check for near-duplicates (same name with slight spelling differences)
// e.g. "Lunar Gray" vs "Lunar Grey", "High Glossy White" vs "High Gloss White"
console.log('\n\nAll style names (for manual review):');
all.forEach(r => console.log(`  [${r.id}] distId=${r.distributorId} | "${r.ourName}" | SKUs=${r.skuCount}`));

await conn.end();
