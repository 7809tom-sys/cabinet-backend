/**
 * Fix wrong style names in cabinet descriptions across ALL Milestone styles.
 * 
 * The distId=3 import used generic names like "Shaker White", "Shaker Gray" etc.
 * in descriptions. When those SKUs were merged into Milestone styles, the descriptions
 * kept the wrong style name.
 * 
 * For each SKU, replace the wrong style name prefix with the correct style name.
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });
const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Get all Milestone styles
const [milestoneStyles] = await conn.execute(
  `SELECT id, ourName FROM door_styles WHERE distributorId = 1 ORDER BY ourName`
);

// Wrong style name prefixes that may appear in descriptions
const wrongPrefixes = [
  'Shaker White',
  'Shaker Gray',
  'Shaker Grey',
  'Shaker Black',
  'Shaker Espresso',
  'Shaker Expresso',
  'Oxford Mist',
  'Oxford Sage',
  'Oxford White',
  'Oxford Blue',
  'Oxford Cashmere',
  'Oxford Toffee',
  'Antique White',
  'Casselberry Saddle',
  'Casselberry White',
];

let totalFixed = 0;

for (const style of milestoneStyles) {
  // Get all SKUs for this style with their cabinet descriptions
  const [skus] = await conn.execute(
    `SELECT DISTINCT c.id as cabId, c.masterCode, c.description
     FROM distributor_skus ds
     JOIN cabinets c ON c.id = ds.cabinetId
     WHERE ds.styleId = ?
     ORDER BY c.masterCode`,
    [style.id]
  );
  
  let styleFixed = 0;
  
  for (const cab of skus) {
    const desc = cab.description || '';
    let newDesc = desc;
    
    for (const wrongPrefix of wrongPrefixes) {
      // Only replace if the description STARTS with this wrong prefix
      // (to avoid replacing style names in the middle of a sentence)
      if (newDesc.startsWith(wrongPrefix + ' ') || newDesc.startsWith(wrongPrefix + '\t')) {
        newDesc = style.ourName + newDesc.substring(wrongPrefix.length);
        break; // Only replace once
      }
    }
    
    if (newDesc !== desc) {
      await conn.execute(`UPDATE cabinets SET description = ? WHERE id = ?`, [newDesc, cab.cabId]);
      styleFixed++;
      totalFixed++;
    }
  }
  
  if (styleFixed > 0) {
    console.log(`${style.ourName}: fixed ${styleFixed} descriptions`);
  }
}

console.log(`\nTotal fixed: ${totalFixed}`);

// Verify - check for any remaining wrong descriptions
let remaining = 0;
for (const prefix of wrongPrefixes) {
  const [count] = await conn.execute(
    `SELECT COUNT(DISTINCT c.id) as cnt
     FROM distributor_skus ds
     JOIN door_styles dst ON dst.id = ds.styleId
     JOIN cabinets c ON c.id = ds.cabinetId
     WHERE dst.distributorId = 1
     AND c.description LIKE ?
     AND dst.ourName NOT LIKE ?`,
    [prefix + '%', '%' + prefix.split(' ')[0] + '%']
  );
  if (count[0].cnt > 0) {
    console.log(`Still has "${prefix}" in wrong style: ${count[0].cnt}`);
    remaining += count[0].cnt;
  }
}
if (remaining === 0) console.log('All descriptions corrected ✓');

await conn.end();
