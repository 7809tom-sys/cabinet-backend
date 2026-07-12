/**
 * Reformat all cabinet descriptions so the style name appears at the END.
 * 
 * Current format: "Floral Grey Three Drawer Base Cabinet - 24"W x 34-1/2"H x 24"D"
 * Target format:  "Three Drawer Base Cabinet, 24"W x 34-1/2"H x 24"D — Floral Grey"
 * 
 * Also handles:
 * - "Shaker White Base Cabinet - 24"W..." -> "Base Cabinet, 24"W... — Shaker White"
 * - "Aspen Charcoal Gray Wall Cabinet..." -> "Wall Cabinet... — Aspen Charcoal Gray"
 */

import { createConnection } from 'mysql2/promise';

const db = await createConnection(process.env.DATABASE_URL);

// Get all door styles to know their names
const [styles] = await db.query('SELECT id, ourName FROM door_styles WHERE isActive = 1');
const styleNames = styles.map(s => s.ourName).filter(Boolean).sort((a, b) => b.length - a.length); // longest first

console.log(`Found ${styleNames.length} active styles`);

// Get all cabinets with descriptions
const [cabinets] = await db.query(
  'SELECT id, masterCode, description FROM cabinets WHERE description IS NOT NULL AND description != "" ORDER BY id'
);

console.log(`Processing ${cabinets.length} cabinets...`);

let updated = 0;
let skipped = 0;
const updates = [];

for (const cab of cabinets) {
  const desc = cab.description;
  if (!desc) continue;

  // Find which style name is at the beginning of the description
  let matchedStyle = null;
  let restOfDesc = desc;

  for (const styleName of styleNames) {
    // Check if description starts with the style name (case-insensitive)
    if (desc.toLowerCase().startsWith(styleName.toLowerCase())) {
      matchedStyle = styleName;
      // Remove the style name from the beginning
      restOfDesc = desc.substring(styleName.length).trim();
      // Remove leading dash, hyphen, or space
      restOfDesc = restOfDesc.replace(/^[-–—\s]+/, '').trim();
      break;
    }
  }

  if (!matchedStyle) {
    // Check if style name is already at the end (already formatted correctly)
    const alreadyAtEnd = styleNames.some(s => desc.toLowerCase().endsWith(s.toLowerCase()) || desc.toLowerCase().endsWith(`— ${s.toLowerCase()}`));
    if (alreadyAtEnd) {
      skipped++;
      continue;
    }
    // No style name found - skip
    skipped++;
    continue;
  }

  // Now format: "Cabinet Type, Dimensions — Style Name"
  // The restOfDesc might be: "Three Drawer Base Cabinet - 24"W x 34-1/2"H x 24"D"
  // We want: "Three Drawer Base Cabinet, 24"W x 34-1/2"H x 24"D — Floral Grey"
  
  // Replace the separator between cabinet type and dimensions
  // Pattern: "Cabinet description - WxHxD" -> "Cabinet description, WxHxD"
  let newDesc = restOfDesc;
  
  // Replace " - " before dimension specs with ", "
  // Dimensions look like: 09"W, 12"W, 24"W etc.
  newDesc = newDesc.replace(/\s+-\s+(\d+(?:\.\d+)?(?:["']|(?:inch|in))?W)/i, ', $1');
  
  // Append style name at the end with em dash
  newDesc = `${newDesc} — ${matchedStyle}`;

  if (newDesc !== desc) {
    updates.push({ id: cab.id, newDesc });
    updated++;
  } else {
    skipped++;
  }
}

console.log(`\nWill update ${updated} descriptions, skip ${skipped}`);
console.log('\nSample updates (first 10):');
for (const u of updates.slice(0, 10)) {
  const orig = cabinets.find(c => c.id === u.id);
  console.log(`  BEFORE: ${orig?.description}`);
  console.log(`  AFTER:  ${u.newDesc}`);
  console.log('');
}

// Apply updates in batches
const BATCH = 500;
for (let i = 0; i < updates.length; i += BATCH) {
  const batch = updates.slice(i, i + BATCH);
  for (const u of batch) {
    await db.query('UPDATE cabinets SET description = ? WHERE id = ?', [u.newDesc, u.id]);
  }
  console.log(`Updated ${Math.min(i + BATCH, updates.length)} / ${updates.length}`);
}

await db.end();
console.log(`\nDone! Updated ${updated} cabinet descriptions.`);
