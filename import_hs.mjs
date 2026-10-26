/**
 * Import Hickory Shaker (HS) products for Ashford (Clark & Son, distributorId=2).
 * listPrice = Special Price (your cost).
 */

import { readFileSync } from 'fs';
import mysql from 'mysql2/promise';

const DIST_ID = 2;
const HS_STYLE_CODE = 'HS';

const items = JSON.parse(readFileSync('/home/ubuntu/hs_items.json', 'utf8'));
console.log(`Loaded ${items.length} HS items`);

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// 1. Get HS style ID
const [styleRows] = await conn.query(
  `SELECT id, styleCode, ourName FROM door_styles WHERE distributorId = ? AND styleCode = ? LIMIT 1`,
  [DIST_ID, HS_STYLE_CODE]
);
if (styleRows.length === 0) {
  console.error('ERROR: HS door style not found for Ashford. Aborting.');
  process.exit(1);
}
const styleId = styleRows[0].id;
console.log(`HS style: id=${styleId}, ourName="${styleRows[0].ourName}"`);

// 2. Load all existing cabinet masterCodes
const [cabRows] = await conn.query(`SELECT id, masterCode FROM cabinets`);
const cabMap = {};
for (const r of cabRows) cabMap[r.masterCode.toUpperCase()] = r.id;
console.log(`Loaded ${cabRows.length} existing cabinet records`);

// 3. Delete existing HS SKUs (clean slate)
const [delResult] = await conn.query(
  `DELETE FROM distributor_skus WHERE distributorId = ? AND styleId = ?`,
  [DIST_ID, styleId]
);
console.log(`Deleted ${delResult.affectedRows} existing HS SKUs`);

// 4. Infer category + subCategory from master code
function inferCategory(masterCode) {
  const code = masterCode.toUpperCase();
  if (code.startsWith('UC') || code.startsWith('UOC') || code.startsWith('UCB')) return { category: 'Tall', subCategory: 'Utility Cabinet' };
  if (code.startsWith('V')) return { category: 'Vanity', subCategory: 'Vanity Cabinet' };
  if (code.startsWith('WR')) return { category: 'Wall', subCategory: 'Refrigerator Wall Cabinet' };
  if (code.startsWith('WDC') || code.startsWith('WBC') || code.startsWith('WCA')) return { category: 'Wall', subCategory: 'Wall Cabinet' };
  if (code.startsWith('WSC') && code.length <= 5) return { category: 'Wall', subCategory: 'Wall Spice Cabinet' };
  if (code.startsWith('WSC') && code.length > 5) return { category: 'Accessory', subCategory: 'Wine Storage' };
  if (code.startsWith('MW')) return { category: 'Wall', subCategory: 'Microwave Wall Cabinet' };
  if (code.startsWith('W') && !code.startsWith('WF') && !code.startsWith('WFF') && !code.startsWith('WS') && !code.startsWith('WEP') && !code.startsWith('WR') && !code.startsWith('WDC') && !code.startsWith('WBC') && !code.startsWith('WCA') && !code.startsWith('WSC')) return { category: 'Wall', subCategory: 'Wall Cabinet' };
  if (code.startsWith('FHB')) return { category: 'Base', subCategory: 'Full Height Base' };
  if (code.startsWith('2DB')) return { category: 'Base', subCategory: 'Drawer Base' };
  if (code.startsWith('DB')) return { category: 'Base', subCategory: 'Drawer Base' };
  if (code.startsWith('SB') || code.startsWith('FSB')) return { category: 'Base', subCategory: 'Sink Base' };
  if (code.startsWith('DCSB')) return { category: 'Base', subCategory: 'Corner Sink Base' };
  if (code.startsWith('TB')) return { category: 'Base', subCategory: 'Tray Base' };
  if (code.startsWith('BBC')) return { category: 'Base', subCategory: 'Blind Corner Base' };
  if (code.startsWith('CDB')) return { category: 'Base', subCategory: 'Corner Drawer Base' };
  if (code.startsWith('LS')) return { category: 'Base', subCategory: 'Lazy Susan Corner Base' };
  if (code.startsWith('BA')) return { category: 'Base', subCategory: 'Base End Cabinet' };
  if (code.startsWith('BMC')) return { category: 'Base', subCategory: 'Base Microwave Cabinet' };
  if (code.startsWith('BSD') || code.startsWith('BSR')) return { category: 'Base', subCategory: 'Base Spice Cabinet' };
  if (code.startsWith('B') && !code.startsWith('BA') && !code.startsWith('BBC') && !code.startsWith('BF') && !code.startsWith('BFF') && !code.startsWith('BMC') && !code.startsWith('BSD') && !code.startsWith('BEP') && !code.startsWith('BM') && !code.startsWith('BS')) return { category: 'Base', subCategory: 'Base Cabinet' };
  if (code.startsWith('BS') && code !== 'BSD6') return { category: 'Accessory', subCategory: 'Skin Panel' };
  if (code.startsWith('TS')) return { category: 'Accessory', subCategory: 'Skin Panel' };
  if (code.startsWith('BF') || code.startsWith('TF') || code.startsWith('WF') || code.startsWith('BFF') || code.startsWith('TFF') || code.startsWith('WFF')) return { category: 'Accessory', subCategory: 'Filler' };
  if (code.startsWith('TK')) return { category: 'Accessory', subCategory: 'Toe Kick' };
  if (code.startsWith('BEP') || code.startsWith('WEP') || code.startsWith('REP') || code.startsWith('DP') || code.startsWith('IS') || code.startsWith('SPW')) return { category: 'Accessory', subCategory: 'Skin Panel' };
  if (code.startsWith('BM8') || code.startsWith('SHM') || code.startsWith('LCM') || code.startsWith('LRM') || code.startsWith('OCS') || code.startsWith('DEC') || code.startsWith('ROPE') || code.startsWith('SM') || code.startsWith('LVC')) return { category: 'Accessory', subCategory: 'Trim & Molding' };
  if (code.startsWith('SCDL') || code.startsWith('CBL')) return { category: 'Accessory', subCategory: 'Decorative Leg' };
  if (code.startsWith('VA')) return { category: 'Accessory', subCategory: 'Valance' };
  if (code.startsWith('UNIV-ROT') || code.startsWith('ROT')) return { category: 'Accessories', subCategory: 'Roll Out Trays' };
  if (code.startsWith('RHF')) return { category: 'Accessories', subCategory: 'Range Hood' };
  if (code.startsWith('UCD')) return { category: 'Accessory', subCategory: 'Specialty' };
  if (code.startsWith('AG')) return { category: 'Accessory', subCategory: 'Specialty' };
  if (code.startsWith('LWR')) return { category: 'Accessories', subCategory: 'Wine Storage' };
  if (code.startsWith('PR')) return { category: 'Accessory', subCategory: 'Specialty' };
  return { category: 'Accessory', subCategory: 'Specialty' };
}

// 5. Process each item
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
      const [existing] = await conn.query(`SELECT id FROM cabinets WHERE masterCode = ? LIMIT 1`, [item.masterCode]);
      cabinetId = existing[0]?.id;
    }

    if (cabinetId) {
      cabMap[upperCode] = cabinetId;
      created++;
      newCabinets.push({ masterCode: item.masterCode, desc: item.description.substring(0, 60) });
    } else {
      console.warn(`  SKIP: could not create cabinet for ${item.masterCode}`);
      skipped++;
      continue;
    }
  }

  const platformSku = `CS_HS_${item.masterCode}`;
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

console.log(`\n=== HS IMPORT COMPLETE ===`);
console.log(`Inserted/updated SKUs: ${inserted}`);
console.log(`New cabinet records created: ${created}`);
console.log(`Skipped: ${skipped}`);

if (newCabinets.length > 0) {
  console.log(`\nNew cabinets created (${newCabinets.length}):`);
  for (const c of newCabinets) console.log(`  ${c.masterCode.padEnd(20)} ${c.desc}`);
}

// Summary
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
