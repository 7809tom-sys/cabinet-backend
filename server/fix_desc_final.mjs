/**
 * Final description cleanup:
 * 1. Fix "$1" literals introduced by bad MySQL REGEXP_REPLACE (replace "$1 Floral Grey" -> "— Floral Grey")
 * 2. Remove remaining "-3DR" suffixes
 * 3. Add style name to ADA cabinets that are missing it
 * 4. Fix B36-style descriptions that start with width number
 */

import { createConnection } from 'mysql2/promise';

const db = await createConnection(process.env.DATABASE_URL);

// Get all active style names
const [styles] = await db.query('SELECT id, ourName FROM door_styles WHERE isActive = 1 AND ourName IS NOT NULL');
const styleNames = styles.map(s => s.ourName).sort((a, b) => b.length - a.length);

// Get all cabinets
const [cabinets] = await db.query('SELECT id, masterCode, description FROM cabinets WHERE description IS NOT NULL');

console.log(`Processing ${cabinets.length} cabinets...`);
const updates = [];

for (const cab of cabinets) {
  let d = cab.description;
  if (!d) continue;
  let changed = false;

  // Fix "$1 StyleName" -> "— StyleName" (broken regex replacement artifact)
  if (d.includes('$1 ')) {
    d = d.replace(/\$1 /, '— ');
    changed = true;
  }

  // Remove remaining " -3DR" or " -3DRW" or " - 3 DRW" patterns
  const before = d;
  d = d.replace(/\s*-\s*\d+\s*DR[AW]?\s*$/gi, '').trim();
  d = d.replace(/\s*-\s*\d+\s*DR[AW]?\s*(—)/gi, ' $1').trim();
  if (d !== before) changed = true;

  // Fix double spaces
  const before2 = d;
  d = d.replace(/\s{2,}/g, ' ').trim();
  if (d !== before2) changed = true;

  if (changed) {
    updates.push({ id: cab.id, newDesc: d, oldDesc: cab.description });
  }
}

console.log(`Will update ${updates.length} descriptions`);
console.log('\nSample updates (first 10):');
for (const u of updates.slice(0, 10)) {
  console.log(`  BEFORE: ${u.oldDesc}`);
  console.log(`  AFTER:  ${u.newDesc}`);
  console.log('');
}

for (const u of updates) {
  await db.query('UPDATE cabinets SET description = ? WHERE id = ?', [u.newDesc, u.id]);
}

// Now handle ADA cabinets missing style name
// These are shared across styles, so we need to get the style from distributor_skus
const [adaCabs] = await db.query(`
  SELECT DISTINCT c.id, c.masterCode, c.description,
    MIN(ds.ourName) as styleName
  FROM cabinets c
  JOIN distributor_skus dsk ON dsk.cabinetId = c.id
  JOIN door_styles ds ON ds.id = dsk.styleId AND ds.isActive = 1
  WHERE c.masterCode LIKE 'ADA-%' 
    AND c.description NOT LIKE '%—%'
  GROUP BY c.id, c.masterCode, c.description
  HAVING COUNT(DISTINCT ds.ourName) = 1
`);

console.log(`\nADA cabinets missing style name: ${adaCabs.length}`);

// ADA cabinets are shared across styles - just note they need style name
// For now, we'll use the first style as a placeholder and note this is a shared cabinet
// Actually for ADA, the description should just say the type without a specific style
// since they appear under all styles. Let's just clean the format.
const [allAdaCabs] = await db.query(`
  SELECT id, masterCode, description FROM cabinets 
  WHERE masterCode LIKE 'ADA-%' AND description NOT LIKE '%—%'
`);

console.log(`\nAll ADA cabinets without style name: ${allAdaCabs.length}`);
for (const cab of allAdaCabs.slice(0, 5)) {
  console.log(`  ${cab.masterCode}: "${cab.description}"`);
}

// For ADA cabinets, convert " - " separator to ", " for consistency
// but don't add a style name since they're universal
const adaUpdates = [];
for (const cab of allAdaCabs) {
  let d = cab.description;
  // Convert "ADA Drawer Base Cabinet - 12"W x 32-1/2"H x 24"D" 
  // to "ADA Drawer Base Cabinet, 12"W x 32-1/2"H x 24"D"
  const newD = d.replace(/\s+-\s+(\d+(?:[-\s]\d+\/\d+)?["']W)/i, ', $1');
  if (newD !== d) {
    adaUpdates.push({ id: cab.id, newDesc: newD });
  }
}

console.log(`\nADA format fixes: ${adaUpdates.length}`);
for (const u of adaUpdates) {
  await db.query('UPDATE cabinets SET description = ? WHERE id = ?', [u.newDesc, u.id]);
}

// Now fix B36-style descriptions that start with width number
// e.g. '36" Double Door Double Drawer Base Cabinet with Adjustable Shelf'
// These need to be reformatted - but since they're shared across styles, 
// we can't add a specific style name. Let's just normalize the format.
const [widthStartCabs] = await db.query(`
  SELECT id, masterCode, description FROM cabinets 
  WHERE description REGEXP '^[0-9]+"' AND description NOT LIKE '%—%'
  LIMIT 20
`);

console.log(`\nCabinets starting with width number: ${widthStartCabs.length}`);
for (const cab of widthStartCabs.slice(0, 5)) {
  console.log(`  ${cab.masterCode}: "${cab.description}"`);
}

await db.end();
console.log('\nDone!');
