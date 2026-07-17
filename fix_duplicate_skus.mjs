/**
 * Fix duplicate platformSkus in distributor_skus.
 *
 * Root cause: Some import scripts used bare masterCode as platformSku (e.g. "BBC36")
 * instead of a distributor-prefixed form (e.g. "CS_BBC36" for Clark & Son).
 *
 * Strategy:
 * 1. Find all platformSkus that appear more than once.
 * 2. For each duplicate group, identify which rows have a bare (non-prefixed) platformSku.
 * 3. Re-prefix those rows with the correct distributor prefix.
 * 4. Verify no duplicates remain.
 */

import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Distributor prefix map (id -> prefix)
const DIST_PREFIX = {
  1: 'AH',   // Ashford (if id=1) — check actual IDs
  2: 'CS',   // Clark & Son / Ashford
  3: 'PR',   // Preston / Skyline
  4: 'MD',   // Madison / US Cabinet Depot
};

// First, check actual distributor IDs
const [distRows] = await conn.query(`SELECT id, name, code FROM distributors ORDER BY id`);
console.log('Distributors:');
for (const d of distRows) console.log(`  id=${d.id} code=${d.code} name=${d.name}`);

// Build prefix map from actual data
const prefixMap = {};
for (const d of distRows) {
  if (d.code === 'CS') prefixMap[d.id] = 'CS';
  else if (d.code === 'PR' || d.name?.toLowerCase().includes('skyline') || d.name?.toLowerCase().includes('preston')) prefixMap[d.id] = 'PR';
  else if (d.code === 'MD' || d.name?.toLowerCase().includes('madison') || d.name?.toLowerCase().includes('cabinet depot')) prefixMap[d.id] = 'MD';
  else if (d.code === 'SC' || d.name?.toLowerCase().includes('stone creek') || d.name?.toLowerCase().includes('pelican')) prefixMap[d.id] = 'SC';
  else prefixMap[d.id] = `D${d.id}`;
}
console.log('\nPrefix map:', prefixMap);

// Find all duplicate platformSkus with full details
const [dupes] = await conn.query(`
  SELECT dsk.id, dsk.platformSku, dsk.distributorSku, dsk.distributorId, dsk.styleId,
         d.name as distName, d.code as distCode, ds.styleCode
  FROM distributor_skus dsk
  JOIN distributors d ON d.id = dsk.distributorId
  JOIN door_styles ds ON ds.id = dsk.styleId
  WHERE dsk.platformSku IN (
    SELECT platformSku FROM distributor_skus GROUP BY platformSku HAVING COUNT(*) > 1
  )
  ORDER BY dsk.platformSku, dsk.distributorId
`);

console.log(`\nFound ${dupes.length} rows with duplicate platformSkus`);

// Group by platformSku
const groups = {};
for (const row of dupes) {
  if (!groups[row.platformSku]) groups[row.platformSku] = [];
  groups[row.platformSku].push(row);
}

console.log(`Unique duplicate platformSkus: ${Object.keys(groups).length}`);

// Show first 10 examples
let shown = 0;
for (const [sku, rows] of Object.entries(groups)) {
  if (shown++ >= 10) break;
  console.log(`  "${sku}" → ${rows.map(r => `id=${r.id} dist=${r.distCode}(${r.distributorId}) style=${r.styleCode}`).join(' | ')}`);
}

// Fix: for each row in a duplicate group, if the platformSku doesn't start with the
// distributor's prefix, update it to prefix_platformSku
let fixed = 0;
let conflicts = 0;

for (const [sku, rows] of Object.entries(groups)) {
  for (const row of rows) {
    const prefix = prefixMap[row.distributorId];
    if (!prefix) {
      console.warn(`  No prefix for distributorId=${row.distributorId}, skipping row id=${row.id}`);
      continue;
    }
    
    // Check if already prefixed correctly
    if (row.platformSku.startsWith(prefix + '_')) {
      // Already has the right prefix — this row is fine, don't touch it
      continue;
    }
    
    // Need to add prefix
    const newSku = `${prefix}_${row.platformSku}`;
    
    // Check if newSku already exists (would create another conflict)
    const [existing] = await conn.query(
      `SELECT id FROM distributor_skus WHERE platformSku = ? AND id != ?`,
      [newSku, row.id]
    );
    
    if (existing.length > 0) {
      // The prefixed version already exists — this is a true duplicate within same distributor
      // Delete the un-prefixed one (keep the prefixed one)
      console.log(`  DELETING duplicate: id=${row.id} sku="${row.platformSku}" (prefixed version "${newSku}" already exists)`);
      await conn.query(`DELETE FROM distributor_skus WHERE id = ?`, [row.id]);
      conflicts++;
    } else {
      // Safe to rename
      await conn.query(`UPDATE distributor_skus SET platformSku = ? WHERE id = ?`, [newSku, row.id]);
      fixed++;
    }
  }
}

console.log(`\nFixed: ${fixed} rows renamed with prefix`);
console.log(`Deleted: ${conflicts} true duplicates`);

// Verify
const [remaining] = await conn.query(`
  SELECT COUNT(*) as cnt FROM (
    SELECT platformSku FROM distributor_skus GROUP BY platformSku HAVING COUNT(*) > 1
  ) t
`);
console.log(`\nRemaining duplicate platformSkus: ${remaining[0].cnt}`);

// Final summary
const [summary] = await conn.query(`
  SELECT d.name, d.code, COUNT(dsk.id) as totalSkus
  FROM distributors d
  LEFT JOIN distributor_skus dsk ON dsk.distributorId = d.id AND dsk.isAvailable = 1
  GROUP BY d.id, d.name, d.code
  ORDER BY d.id
`);
console.log('\nFinal SKU counts per distributor:');
for (const r of summary) console.log(`  ${r.code?.padEnd(4)} ${r.name?.padEnd(30)} ${r.totalSkus} SKUs`);

await conn.end();
