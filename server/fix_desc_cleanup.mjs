/**
 * Clean up cabinet descriptions:
 * 1. Remove redundant "-3DR", "-2DR", "-1DR", "- 3DRW" etc. suffixes before the style name
 * 2. Fix ADA cabinets that don't have the style name at the end
 * 3. Fix cabinets that start with width number (e.g. "18" Single Door...")
 * 4. Fix descriptions with stray hyphens in dimensions (e.g. "34-1/2"H-")
 */

import { createConnection } from 'mysql2/promise';

const db = await createConnection(process.env.DATABASE_URL);

// Get all cabinets with their style names
const [cabinets] = await db.query(`
  SELECT DISTINCT c.id, c.masterCode, c.description,
    GROUP_CONCAT(DISTINCT ds.ourName ORDER BY ds.ourName SEPARATOR '|') as styleNames
  FROM cabinets c
  LEFT JOIN distributor_skus dsk ON dsk.cabinetId = c.id
  LEFT JOIN door_styles ds ON ds.id = dsk.styleId AND ds.isActive = 1
  WHERE c.description IS NOT NULL AND c.description != ''
  GROUP BY c.id, c.masterCode, c.description
`);

console.log(`Processing ${cabinets.length} cabinets...`);

let updated = 0;
const updates = [];

for (const cab of cabinets) {
  let desc = cab.description;
  if (!desc) continue;
  
  let newDesc = desc;
  
  // 1. Remove redundant drawer count suffixes before the em dash
  // e.g. " -3DR — Floral Grey" -> " — Floral Grey"
  // e.g. " - 3DRW — Floral Grey" -> " — Floral Grey"
  // e.g. " -3DR" at end -> ""
  newDesc = newDesc.replace(/\s*[-–]\s*\d+\s*DR(?:W|AWR)?\s*(—)/gi, ' $1');
  newDesc = newDesc.replace(/\s*[-–]\s*\d+\s*DR(?:W|AWR)?\s*$/gi, '');
  
  // 2. Fix stray hyphens in dimensions (e.g. '34-1/2"H- x' -> '34-1/2"H x')
  newDesc = newDesc.replace(/(\d+"[HWD])-\s+x/g, '$1 x');
  newDesc = newDesc.replace(/(\d+"[HWD])-\s*—/g, '$1 —');
  
  // 3. Fix double spaces
  newDesc = newDesc.replace(/\s{2,}/g, ' ').trim();
  
  // 4. For ADA cabinets without style name at end, append the style name
  // Only do this if the cabinet has exactly ONE style (to avoid ambiguity)
  if (cab.styleNames && !cab.styleNames.includes('|')) {
    const styleName = cab.styleNames;
    const hasStyleAtEnd = newDesc.endsWith(`— ${styleName}`) || newDesc.endsWith(`—${styleName}`);
    if (!hasStyleAtEnd && !newDesc.includes('—')) {
      // Convert old format: "ADA Drawer Base Cabinet - 12"W x 32-1/2"H x 24"D - 3DRW"
      // To new format: "ADA Drawer Base Cabinet, 12"W x 32-1/2"H x 24"D — Style Name"
      // First, replace " - " before dimensions with ", "
      newDesc = newDesc.replace(/\s+-\s+(\d+(?:[-\s]\d+\/\d+)?["']?W)/i, ', $1');
      // Remove trailing " - 3DRW" or similar
      newDesc = newDesc.replace(/\s*[-–]\s*\d+\s*DR(?:W|AWR)?\s*$/gi, '');
      newDesc = newDesc.trim();
      // Append style name
      newDesc = `${newDesc} — ${styleName}`;
    }
  }
  
  // 5. Fix descriptions starting with width number like '18" Single Door...'
  // These should remain as-is but need style name at end if missing
  if (cab.styleNames && !cab.styleNames.includes('|')) {
    const styleName = cab.styleNames;
    if (!newDesc.includes('—') && /^\d+["']/.test(newDesc)) {
      newDesc = `${newDesc} — ${styleName}`;
    }
  }
  
  if (newDesc !== desc) {
    updates.push({ id: cab.id, newDesc, oldDesc: desc });
    updated++;
  }
}

console.log(`\nWill update ${updated} descriptions`);
console.log('\nSample updates (first 15):');
for (const u of updates.slice(0, 15)) {
  console.log(`  BEFORE: ${u.oldDesc}`);
  console.log(`  AFTER:  ${u.newDesc}`);
  console.log('');
}

// Apply updates in batches
const BATCH = 200;
for (let i = 0; i < updates.length; i += BATCH) {
  const batch = updates.slice(i, i + BATCH);
  for (const u of batch) {
    await db.query('UPDATE cabinets SET description = ? WHERE id = ?', [u.newDesc, u.id]);
  }
  console.log(`Updated ${Math.min(i + BATCH, updates.length)} / ${updates.length}`);
}

await db.end();
console.log(`\nDone! Updated ${updated} cabinet descriptions.`);
