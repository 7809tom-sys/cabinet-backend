/**
 * Fix descriptions that start with width number like:
 * '18" Single Door Single Drawer Base Cabinet with Adjustable Shelf'
 * -> 'Single Door Single Drawer Base Cabinet, 18"W x 34-1/2"H x 24"D'
 * 
 * These cabinets are shared across styles so we use the width from the masterCode
 * and standard dimensions from the cabinet type.
 */

import { createConnection } from 'mysql2/promise';

const db = await createConnection(process.env.DATABASE_URL);

const [cabs] = await db.query(`
  SELECT id, masterCode, description, width, height, depth, category, subCategory
  FROM cabinets 
  WHERE description REGEXP '^[0-9]+"'
`);

console.log(`Found ${cabs.length} cabinets with width-first descriptions`);

const updates = [];

for (const cab of cabs) {
  const d = cab.description;
  // Extract the width from the start: '18" Single Door...' -> width=18, rest='Single Door...'
  const match = d.match(/^(\d+)["']\s+(.+)$/);
  if (!match) continue;
  
  const width = parseInt(match[1]);
  let rest = match[2]; // e.g. 'Single Door Single Drawer Base Cabinet with Adjustable Shelf'
  
  // Remove trailing "with Adjustable Shelf" since that's implied
  rest = rest.replace(/\s+with\s+Adjustable\s+Shelf\s*$/i, '').trim();
  
  // Get dimensions
  const w = cab.width || width;
  const h = cab.height || 34.5;
  const dep = cab.depth || 24;
  
  // Format: "Single Door Single Drawer Base Cabinet, 18"W x 34-1/2"H x 24"D"
  const hStr = h === 34.5 ? '34-1/2' : h === 30 ? '30' : h === 42 ? '42' : String(h);
  const newDesc = `${rest}, ${w}"W x ${hStr}"H x ${dep}"D`;
  
  updates.push({ id: cab.id, newDesc, oldDesc: d });
}

console.log(`\nWill update ${updates.length} descriptions`);
console.log('\nSample updates:');
for (const u of updates.slice(0, 10)) {
  console.log(`  BEFORE: ${u.oldDesc}`);
  console.log(`  AFTER:  ${u.newDesc}`);
  console.log('');
}

for (const u of updates) {
  await db.query('UPDATE cabinets SET description = ? WHERE id = ?', [u.newDesc, u.id]);
}

await db.end();
console.log('Done!');
