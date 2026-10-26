/**
 * 1. Fix remaining duplicate platformSkus (intra-distributor, same sku across multiple styles)
 *    Strategy: for each duplicate group within the same distributor, keep the row with the
 *    highest id (most recently inserted) and delete the older ones.
 *    BUT: if the same platformSku appears for different styleCodes, we need to make them unique
 *    by appending the styleCode: e.g. CS_HS_BMC27 → CS_HS_BMC27 (keep) and CS_ASP_BMC27 (rename).
 *
 * 2. Import West Point Grey (WPG) for Ashford using CS_WPG_ prefix.
 */

import { readFileSync } from 'fs';
import mysql from 'mysql2/promise';
import { createRequire } from 'module';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// ============================================================
// PART 1: Fix remaining duplicates
// ============================================================
console.log('=== PART 1: Fix remaining duplicate platformSkus ===\n');

const [dupeRows] = await conn.query(`
  SELECT dsk.id, dsk.platformSku, dsk.distributorId, dsk.styleId, dsk.listPrice,
         d.code as distCode, ds.styleCode, ds.ourName
  FROM distributor_skus dsk
  JOIN distributors d ON d.id = dsk.distributorId
  JOIN door_styles ds ON ds.id = dsk.styleId
  WHERE dsk.platformSku IN (
    SELECT platformSku FROM distributor_skus GROUP BY platformSku HAVING COUNT(*) > 1
  )
  ORDER BY dsk.platformSku, dsk.styleId, dsk.id
`);

// Group by platformSku
const groups = {};
for (const row of dupeRows) {
  if (!groups[row.platformSku]) groups[row.platformSku] = [];
  groups[row.platformSku].push(row);
}

console.log(`Found ${Object.keys(groups).length} duplicate platformSku groups (${dupeRows.length} total rows)`);

let deleted = 0, renamed = 0;

for (const [sku, rows] of Object.entries(groups)) {
  // Group by styleId
  const byStyle = {};
  for (const r of rows) {
    if (!byStyle[r.styleId]) byStyle[r.styleId] = [];
    byStyle[r.styleId].push(r);
  }

  const styleIds = Object.keys(byStyle);

  if (styleIds.length === 1) {
    // All dupes are same style — true duplicates, keep highest id, delete rest
    const sorted = rows.sort((a, b) => b.id - a.id);
    const keep = sorted[0];
    const toDelete = sorted.slice(1);
    for (const r of toDelete) {
      await conn.query(`DELETE FROM distributor_skus WHERE id = ?`, [r.id]);
      deleted++;
    }
    console.log(`  DEDUPED: "${sku}" — kept id=${keep.id}, deleted ${toDelete.length} dupes (same style ${keep.styleCode})`);
  } else {
    // Different styles share the same platformSku — rename all but the first to include styleCode
    const sorted = rows.sort((a, b) => a.id - b.id);
    // Keep the first one as-is, rename the rest
    for (let i = 1; i < sorted.length; i++) {
      const r = sorted[i];
      // Build new sku: replace the style prefix in the platformSku
      // e.g. CS_HS_BMC27 with styleCode ASP → CS_ASP_BMC27
      const newSku = sku.replace(/^(CS|PR|MD|SC)_[A-Z0-9]+_/, `$1_${r.styleCode}_`);
      if (newSku === sku) {
        // Fallback: append styleCode
        const fallback = `${sku}_${r.styleCode}`;
        await conn.query(`UPDATE distributor_skus SET platformSku = ? WHERE id = ?`, [fallback, r.id]);
        console.log(`  RENAMED: id=${r.id} "${sku}" → "${fallback}" (style ${r.styleCode})`);
      } else {
        await conn.query(`UPDATE distributor_skus SET platformSku = ? WHERE id = ?`, [newSku, r.id]);
        console.log(`  RENAMED: id=${r.id} "${sku}" → "${newSku}" (style ${r.styleCode})`);
      }
      renamed++;
    }
  }
}

console.log(`\nPart 1 complete: deleted=${deleted}, renamed=${renamed}`);

// Verify
const [remaining] = await conn.query(`
  SELECT COUNT(*) as cnt FROM (
    SELECT platformSku FROM distributor_skus GROUP BY platformSku HAVING COUNT(*) > 1
  ) t
`);
console.log(`Remaining duplicates after fix: ${remaining[0].cnt}`);

// ============================================================
// PART 2: Import West Point Grey (WPG)
// ============================================================
console.log('\n=== PART 2: Import West Point Grey (WPG) ===\n');

const DIST_ID = 2; // Clark & Son / Ashford
const WPG_STYLE_CODE = 'WPG';

// Parse WPG items from the text file
const lines = readFileSync('/home/ubuntu/upload/pasted_content_6.txt', 'utf8').split('\n').map(l => l.trim());
const items = [];
let i = 0;
while (i < lines.length) {
  const line = lines[i];
  // Match WPG- codes, WP- codes (typo in source), and universal accessories
  if (/^(WPG-|WP-[A-Z]|LS-[0-9]|UNIV-ROT)/.test(line)) {
    const model = line;
    const desc = lines[i + 1] || '';
    let price = null;
    for (let j = i + 2; j < Math.min(i + 8, lines.length); j++) {
      const m = lines[j].match(/(?:Special Price)?\$([0-9]+\.[0-9]+)/);
      if (m) { price = parseFloat(m[1]); break; }
    }
    if (price !== null && price > 0) {
      // Normalize WP- typos to WPG-
      const normalModel = model.startsWith('WP-') ? 'WPG-' + model.slice(3) : model;
      const master = normalModel.startsWith('WPG-') ? normalModel.slice(4) : normalModel;
      const cleanDesc = desc.replace(/^West Point Grey\s*[-:]?\s*/i, '').replace(/^2 Drawer Base Cabinets:\s*WPG?-\S+\s*/i, '').trim() || desc;
      items.push({ distributorSku: normalModel, masterCode: master, description: cleanDesc, price });
    }
  }
  i++;
}
console.log(`Parsed ${items.length} WPG items`);

// Get WPG style
const [styleRows] = await conn.query(
  `SELECT id, styleCode, ourName FROM door_styles WHERE distributorId = ? AND styleCode = ? LIMIT 1`,
  [DIST_ID, WPG_STYLE_CODE]
);
if (!styleRows.length) { console.error('WPG style not found'); process.exit(1); }
const styleId = styleRows[0].id;
console.log(`WPG style: id=${styleId}, ourName="${styleRows[0].ourName}"`);

// Load existing cabinets
const [cabRows] = await conn.query(`SELECT id, masterCode FROM cabinets`);
const cabMap = {};
for (const r of cabRows) cabMap[r.masterCode.toUpperCase()] = r.id;

// Delete existing WPG SKUs
const [del] = await conn.query(
  `DELETE FROM distributor_skus WHERE distributorId = ? AND styleId = ?`,
  [DIST_ID, styleId]
);
console.log(`Deleted ${del.affectedRows} existing WPG SKUs`);

function inferCategory(code) {
  const c = code.toUpperCase();
  if (c.startsWith('UC') || c.startsWith('UOC') || c.startsWith('UCB')) return { category: 'Tall', subCategory: 'Utility Cabinet' };
  if (c.startsWith('V')) return { category: 'Vanity', subCategory: 'Vanity Cabinet' };
  if (c.startsWith('WR')) return { category: 'Wall', subCategory: 'Refrigerator Wall Cabinet' };
  if (c.startsWith('MW')) return { category: 'Wall', subCategory: 'Microwave Wall Cabinet' };
  if (c.startsWith('FHB')) return { category: 'Base', subCategory: 'Full Height Base' };
  if (c.startsWith('2DB')) return { category: 'Base', subCategory: 'Drawer Base' };
  if (c.startsWith('DB')) return { category: 'Base', subCategory: 'Drawer Base' };
  if (c.startsWith('FSB') || (c.startsWith('SB') && !c.startsWith('SBD'))) return { category: 'Base', subCategory: 'Sink Base' };
  if (c.startsWith('DCSB')) return { category: 'Base', subCategory: 'Corner Sink Base' };
  if (c.startsWith('TB')) return { category: 'Base', subCategory: 'Tray Base' };
  if (c.startsWith('BBC')) return { category: 'Base', subCategory: 'Blind Corner Base' };
  if (c.startsWith('CDB')) return { category: 'Base', subCategory: 'Corner Drawer Base' };
  if (c.startsWith('LS')) return { category: 'Base', subCategory: 'Lazy Susan Corner Base' };
  if (c.startsWith('BA')) return { category: 'Base', subCategory: 'Base End Cabinet' };
  if (c.startsWith('BMC')) return { category: 'Base', subCategory: 'Base Microwave Cabinet' };
  if (c.startsWith('BSD')) return { category: 'Base', subCategory: 'Base Spice Cabinet' };
  if (c.startsWith('B') && !c.startsWith('BA') && !c.startsWith('BBC') && !c.startsWith('BF') && !c.startsWith('BFF') && !c.startsWith('BMC') && !c.startsWith('BSD') && !c.startsWith('BEP') && !c.startsWith('BM8') && !c.startsWith('BS2') && !c.startsWith('BS3')) return { category: 'Base', subCategory: 'Base Cabinet' };
  if (c.startsWith('W') && !c.startsWith('WF') && !c.startsWith('WFF') && !c.startsWith('WEP') && !c.startsWith('WR') && !c.startsWith('WDC') && !c.startsWith('WBC') && !c.startsWith('WSC')) return { category: 'Wall', subCategory: 'Wall Cabinet' };
  if (c.startsWith('BF') || c.startsWith('TF') || c.startsWith('WF') || c.startsWith('BFF') || c.startsWith('TFF') || c.startsWith('WFF')) return { category: 'Accessory', subCategory: 'Filler' };
  if (c.startsWith('BEP') || c.startsWith('WEP') || c.startsWith('REP') || c.startsWith('DP') || c.startsWith('BS2') || c.startsWith('TS')) return { category: 'Accessory', subCategory: 'Skin Panel' };
  if (c.startsWith('TK')) return { category: 'Accessory', subCategory: 'Toe Kick' };
  if (c.startsWith('UNIV-ROT') || c.startsWith('ROT')) return { category: 'Accessory', subCategory: 'Roll Out Trays' };
  if (c.startsWith('PG') || c.startsWith('MD') || c.startsWith('MDWDC')) return { category: 'Accessory', subCategory: 'Glass Door' };
  if (c.startsWith('FFS')) return { category: 'Accessory', subCategory: 'Floating Shelf' };
  if (c.startsWith('VA')) return { category: 'Accessory', subCategory: 'Valance' };
  if (c.startsWith('RHF')) return { category: 'Accessory', subCategory: 'Range Hood' };
  if (c.startsWith('LWR') || c.startsWith('WSC')) return { category: 'Accessory', subCategory: 'Wine Storage' };
  return { category: 'Accessory', subCategory: 'Specialty' };
}

let inserted = 0, created = 0, skipped = 0;
const newCabinets = [];

for (const item of items) {
  const upperCode = item.masterCode.toUpperCase();
  let cabinetId = cabMap[upperCode];

  if (!cabinetId) {
    const { category, subCategory } = inferCategory(item.masterCode);
    const [ins] = await conn.query(`
      INSERT INTO cabinets (masterCode, description, category, subCategory, isActive)
      VALUES (?, ?, ?, ?, 1)
      ON DUPLICATE KEY UPDATE description = VALUES(description), isActive = 1
    `, [item.masterCode, item.description, category, subCategory]);

    if (ins.insertId) {
      cabinetId = ins.insertId;
    } else {
      const [ex] = await conn.query(`SELECT id FROM cabinets WHERE masterCode = ? LIMIT 1`, [item.masterCode]);
      cabinetId = ex[0]?.id;
    }

    if (cabinetId) {
      cabMap[upperCode] = cabinetId;
      created++;
      newCabinets.push({ masterCode: item.masterCode, desc: item.description.substring(0, 60) });
    } else {
      skipped++;
      continue;
    }
  }

  const platformSku = `CS_WPG_${item.masterCode}`;
  await conn.query(`
    INSERT INTO distributor_skus
      (distributorId, styleId, cabinetId, platformSku, distributorSku, listPrice, isAvailable, isPublished)
    VALUES (?, ?, ?, ?, ?, ?, 1, 1)
    ON DUPLICATE KEY UPDATE
      listPrice = VALUES(listPrice), cabinetId = VALUES(cabinetId),
      isAvailable = 1, isPublished = 1
  `, [DIST_ID, styleId, cabinetId, platformSku, item.distributorSku, item.price.toFixed(2)]);
  inserted++;
}

console.log(`\n=== WPG IMPORT COMPLETE ===`);
console.log(`Inserted/updated SKUs: ${inserted}`);
console.log(`New cabinet records created: ${created}`);
console.log(`Skipped: ${skipped}`);
if (newCabinets.length) {
  console.log(`New cabinets (${newCabinets.length}):`);
  for (const c of newCabinets) console.log(`  ${c.masterCode.padEnd(20)} ${c.desc}`);
}

// Final verification
const [finalDupes] = await conn.query(`
  SELECT COUNT(*) as cnt FROM (
    SELECT platformSku FROM distributor_skus GROUP BY platformSku HAVING COUNT(*) > 1
  ) t
`);
console.log(`\nFinal duplicate platformSkus: ${finalDupes[0].cnt}`);

const [summary] = await conn.query(`
  SELECT ds.styleCode, ds.ourName, COUNT(dsk.id) as cnt
  FROM door_styles ds
  LEFT JOIN distributor_skus dsk ON dsk.styleId = ds.id AND dsk.isAvailable = 1
  WHERE ds.distributorId = 2
  GROUP BY ds.id, ds.styleCode, ds.ourName ORDER BY ds.styleCode
`);
console.log('\nAshford per-style active SKUs:');
for (const r of summary) console.log(`  ${r.styleCode.padEnd(6)} ${r.ourName.padEnd(35)} ${r.cnt}`);

await conn.end();
