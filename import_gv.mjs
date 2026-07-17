/**
 * Import Greek Villa (GV) products for Ashford (Clark & Son, distributorId=2).
 * 
 * - Reads parsed items from /home/ubuntu/gv_items.json
 * - masterCode = GV item code with "GV-" prefix stripped (e.g. "B12", "W0930")
 * - For each item:
 *   1. Look up cabinet by masterCode (case-insensitive)
 *   2. If not found, create a new cabinet record using the description
 *   3. Upsert distributor_skus for GV style (styleId for GV under Ashford)
 * - listPrice = the "Special Price" from the sheet (your cost to Clark & Son)
 */

import { readFileSync } from 'fs';
import mysql from 'mysql2/promise';

const DIST_ID = 2;       // Ashford / Clark & Son
const GV_STYLE_CODE = 'GV';

const items = JSON.parse(readFileSync('/home/ubuntu/gv_items.json', 'utf8'));
console.log(`Loaded ${items.length} GV items`);

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Infer category + subCategory from master code prefix
function inferCategory(masterCode, description) {
  const code = masterCode.toUpperCase();
  const desc = description.toLowerCase();
  
  // Utility / Tall cabinets
  if (code.startsWith('UC') || code.startsWith('UOC') || code.startsWith('UCB')) return { category: 'Tall', subCategory: 'Utility Cabinet' };
  // Wall cabinets
  if (code.startsWith('W') && !code.startsWith('WS') && !code.startsWith('WF')) return { category: 'Wall', subCategory: 'Wall Cabinet' };
  // Wall spice
  if (code.startsWith('WSC')) return { category: 'Wall', subCategory: 'Wall Spice Cabinet' };
  // Microwave wall
  if (code.startsWith('MW')) return { category: 'Wall', subCategory: 'Microwave Wall Cabinet' };
  // Base cabinets
  if (code.startsWith('B') && !code.startsWith('BA') && !code.startsWith('BBC') && !code.startsWith('BER') && !code.startsWith('BF') && !code.startsWith('BFF') && !code.startsWith('BMC') && !code.startsWith('BSR') && !code.startsWith('BSD')) return { category: 'Base', subCategory: 'Base Cabinet' };
  // Full height base
  if (code.startsWith('FHB')) return { category: 'Base', subCategory: 'Full Height Base' };
  // Drawer base
  if (code.startsWith('DB') || code.startsWith('2DB')) return { category: 'Base', subCategory: 'Drawer Base' };
  // Sink base
  if (code.startsWith('SB') || code.startsWith('FSB')) return { category: 'Base', subCategory: 'Sink Base' };
  // Tray base
  if (code.startsWith('TB')) return { category: 'Base', subCategory: 'Tray Base' };
  // Blind corner base
  if (code.startsWith('BBC')) return { category: 'Base', subCategory: 'Blind Corner Base' };
  // Corner drawer base
  if (code.startsWith('CDB')) return { category: 'Base', subCategory: 'Corner Drawer Base' };
  // Diagonal corner sink
  if (code.startsWith('DCSB')) return { category: 'Base', subCategory: 'Corner Sink Base' };
  // Lazy Susan
  if (code.startsWith('LS')) return { category: 'Base', subCategory: 'Lazy Susan Corner Base' };
  // Base easy reach
  if (code.startsWith('BER')) return { category: 'Base', subCategory: 'Base Easy Reach' };
  // Base angle
  if (code.startsWith('BA')) return { category: 'Base', subCategory: 'Base End Cabinet' };
  // Base microwave
  if (code.startsWith('BMC')) return { category: 'Base', subCategory: 'Base Microwave Cabinet' };
  // Base spice
  if (code.startsWith('BSD') || code.startsWith('BSR')) return { category: 'Base', subCategory: 'Base Spice Cabinet' };
  // Fillers / trim
  if (code.startsWith('BF') || code.startsWith('TF') || code.startsWith('WF') || code.startsWith('BFF') || code.startsWith('TFF') || code.startsWith('WFF')) return { category: 'Accessory', subCategory: 'Filler' };
  // Island panels
  if (code.startsWith('IS')) return { category: 'Accessory', subCategory: 'Skin Panel' };
  // Crown / molding
  if (code.startsWith('LVC') || code.startsWith('LRM') || code.startsWith('OCS')) return { category: 'Accessory', subCategory: 'Trim & Molding' };
  // Wine rack
  if (code.startsWith('LWR')) return { category: 'Accessories', subCategory: 'Wine Storage' };
  // End panels
  if (code.startsWith('MTEP') || code.startsWith('MVEP')) return { category: 'Accessory', subCategory: 'Decorative End Panel' };
  // Plate rack
  if (code.startsWith('PR')) return { category: 'Accessory', subCategory: 'Specialty' };
  // Default
  return { category: 'Accessory', subCategory: 'Specialty' };
}

// 1. Get GV style ID for Ashford
const [styleRows] = await conn.query(
  `SELECT id, styleCode, ourName FROM door_styles WHERE distributorId = ? AND styleCode = ? LIMIT 1`,
  [DIST_ID, GV_STYLE_CODE]
);
if (styleRows.length === 0) {
  console.error('ERROR: GV door style not found for Ashford (distributorId=2). Aborting.');
  process.exit(1);
}
const styleId = styleRows[0].id;
console.log(`GV style: id=${styleId}, ourName="${styleRows[0].ourName}"`);

// 2. Load all existing cabinet masterCodes
const [cabRows] = await conn.query(`SELECT id, masterCode FROM cabinets`);
const cabMap = {};
for (const r of cabRows) cabMap[r.masterCode.toUpperCase()] = r.id;
console.log(`Loaded ${cabRows.length} existing cabinet records`);

// 3. Delete existing GV SKUs for Ashford (clean slate)
const [delResult] = await conn.query(
  `DELETE FROM distributor_skus WHERE distributorId = ? AND styleId = ?`,
  [DIST_ID, styleId]
);
console.log(`Deleted ${delResult.affectedRows} existing GV SKUs`);

// 4. Process each item
let inserted = 0, created = 0, skipped = 0;
const newCabinets = [];

for (const item of items) {
  const upperCode = item.masterCode.toUpperCase();
  let cabinetId = cabMap[upperCode];

  // Create cabinet if not found
  if (!cabinetId) {
    // Derive a clean description (strip "Greek Villa " prefix)
    const cleanDesc = item.description.replace(/^Greek Villa\s+/i, '').trim();
    
    const { category, subCategory } = inferCategory(item.masterCode, cleanDesc);
    const [ins] = await conn.query(`
      INSERT INTO cabinets (masterCode, description, category, subCategory, isActive)
      VALUES (?, ?, ?, ?, 1)
      ON DUPLICATE KEY UPDATE description = VALUES(description), isActive = 1
    `, [item.masterCode, cleanDesc, category, subCategory]);
    
    if (ins.insertId) {
      cabinetId = ins.insertId;
    } else {
      // ON DUPLICATE KEY — fetch the existing id
      const [existing] = await conn.query(
        `SELECT id FROM cabinets WHERE masterCode = ? LIMIT 1`,
        [item.masterCode]
      );
      cabinetId = existing[0]?.id;
    }
    
    if (cabinetId) {
      cabMap[upperCode] = cabinetId;
      created++;
      newCabinets.push({ masterCode: item.masterCode, desc: cleanDesc });
    } else {
      console.warn(`  SKIP: could not create/find cabinet for ${item.masterCode}`);
      skipped++;
      continue;
    }
  }

  // Upsert distributor_sku
  const platformSku = `CS_GV_${item.masterCode}`;
  await conn.query(`
    INSERT INTO distributor_skus
      (distributorId, styleId, cabinetId, platformSku, distributorSku, listPrice, isAvailable, isPublished)
    VALUES (?, ?, ?, ?, ?, ?, 1, 1)
    ON DUPLICATE KEY UPDATE
      listPrice = VALUES(listPrice),
      cabinetId = VALUES(cabinetId),
      isAvailable = 1,
      isPublished = 1
  `, [DIST_ID, styleId, cabinetId, platformSku, item.distributorSku, item.price.toFixed(2)]);
  inserted++;
}

console.log(`\n=== GV IMPORT COMPLETE ===`);
console.log(`Inserted/updated SKUs: ${inserted}`);
console.log(`New cabinet records created: ${created}`);
console.log(`Skipped: ${skipped}`);

if (newCabinets.length > 0) {
  console.log(`\nNew cabinets created (${newCabinets.length}):`);
  for (const c of newCabinets) {
    console.log(`  ${c.masterCode.padEnd(20)} ${c.desc}`);
  }
}

// Final GV count
const [finalCount] = await conn.query(
  `SELECT COUNT(*) as cnt FROM distributor_skus WHERE distributorId = ? AND styleId = ? AND isAvailable = 1`,
  [DIST_ID, styleId]
);
console.log(`\nTotal active GV SKUs: ${finalCount[0].cnt}`);

// Overall Ashford summary
const [summary] = await conn.query(`
  SELECT ds.styleCode, ds.ourName, COUNT(dsk.id) as cnt
  FROM door_styles ds
  LEFT JOIN distributor_skus dsk ON dsk.styleId = ds.id AND dsk.isAvailable = 1
  WHERE ds.distributorId = 2
  GROUP BY ds.id, ds.styleCode, ds.ourName ORDER BY ds.styleCode
`);
console.log('\nAshford per-style active SKUs:');
for (const r of summary) {
  console.log(`  ${r.styleCode.padEnd(6)} ${r.ourName.padEnd(35)} ${r.cnt}`);
}

await conn.end();
