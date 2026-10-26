/**
 * Import Midnight Black Shaker (MBS / Onyx Shadow) for Ashford (Clark & Son, distributorId=2).
 * platformSku prefix: CS_CS_
 */

import { readFileSync } from 'fs';
import mysql from 'mysql2/promise';

const DIST_ID = 2;
const STYLE_CODE = 'CC';
const PREFIX = 'CS_CC_';

const items = JSON.parse(readFileSync('/home/ubuntu/cc_items.json', 'utf8'));
console.log(`Loaded ${items.length} MBS items`);

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const [styleRows] = await conn.query(
  `SELECT id, styleCode, ourName FROM door_styles WHERE distributorId = ? AND styleCode = ? LIMIT 1`,
  [DIST_ID, STYLE_CODE]
);
if (!styleRows.length) { console.error('MBS style not found'); process.exit(1); }
const styleId = styleRows[0].id;
console.log(`Style: id=${styleId}, ourName="${styleRows[0].ourName}"`);

const [cabRows] = await conn.query(`SELECT id, masterCode FROM cabinets`);
const cabMap = {};
for (const r of cabRows) cabMap[r.masterCode.toUpperCase()] = r.id;

const [del] = await conn.query(`DELETE FROM distributor_skus WHERE distributorId = ? AND styleId = ?`, [DIST_ID, styleId]);
console.log(`Deleted ${del.affectedRows} existing SKUs`);

function inferCategory(code) {
  const c = code.toUpperCase();
  if (c.startsWith('UC') || c.startsWith('UOC') || c.startsWith('UCB')) return { category: 'Tall', subCategory: 'Utility Cabinet' };
  if (c.startsWith('V')) return { category: 'Vanity', subCategory: 'Vanity Cabinet' };
  if (c.startsWith('WR')) return { category: 'Wall', subCategory: 'Refrigerator Wall Cabinet' };
  if (c.startsWith('MW')) return { category: 'Wall', subCategory: 'Microwave Wall Cabinet' };
  if (c.startsWith('WDC') || c.startsWith('WBC') || c.startsWith('WOC')) return { category: 'Wall', subCategory: 'Wall Cabinet' };
  if (c.startsWith('FHB')) return { category: 'Base', subCategory: 'Full Height Base' };
  if (c.startsWith('2DB')) return { category: 'Base', subCategory: 'Drawer Base' };
  if (c.startsWith('DB')) return { category: 'Base', subCategory: 'Drawer Base' };
  if (c.startsWith('FSB') || (c.startsWith('SB') && !c.startsWith('SBD'))) return { category: 'Base', subCategory: 'Sink Base' };
  if (c.startsWith('DCSB')) return { category: 'Base', subCategory: 'Corner Sink Base' };
  if (c.startsWith('TB')) return { category: 'Base', subCategory: 'Tray Base' };
  if (c.startsWith('BBC')) return { category: 'Base', subCategory: 'Blind Corner Base' };
  if (c.startsWith('CDB')) return { category: 'Base', subCategory: 'Corner Drawer Base' };
  if (c.startsWith('LS') || c.startsWith('ER-')) return { category: 'Base', subCategory: 'Lazy Susan Corner Base' };
  if (c.startsWith('BA')) return { category: 'Base', subCategory: 'Base End Cabinet' };
  if (c.startsWith('BMC')) return { category: 'Base', subCategory: 'Base Microwave Cabinet' };
  if (c.startsWith('BSR') || c.startsWith('BSD')) return { category: 'Base', subCategory: 'Base Spice Cabinet' };
  if (c.startsWith('AG')) return { category: 'Accessory', subCategory: 'Appliance Garage' };
  if (c.startsWith('BBFBP') || c.startsWith('BB4')) return { category: 'Accessory', subCategory: 'Bead Board' };
  if (c.startsWith('BM8') || c.startsWith('BM9')) return { category: 'Accessory', subCategory: 'Moulding' };
  if (c.startsWith('B') && !c.startsWith('BA') && !c.startsWith('BBC') && !c.startsWith('BF') && !c.startsWith('BFF') && !c.startsWith('BMC') && !c.startsWith('BSR') && !c.startsWith('BSD') && !c.startsWith('BEP') && !c.startsWith('BS2') && !c.startsWith('BS3') && !c.startsWith('BM') && !c.startsWith('BB') && !c.startsWith('AG')) return { category: 'Base', subCategory: 'Base Cabinet' };
  if (c.startsWith('W') && !c.startsWith('WF') && !c.startsWith('WFF') && !c.startsWith('WEP') && !c.startsWith('WR') && !c.startsWith('WDC') && !c.startsWith('WBC') && !c.startsWith('WSC') && !c.startsWith('WOC') && !c.startsWith('WS1') && !c.startsWith('WS2') && !c.startsWith('WS3') && !c.startsWith('WS4')) return { category: 'Wall', subCategory: 'Wall Cabinet' };
  if (c.startsWith('BF') || c.startsWith('TF') || c.startsWith('WF') || c.startsWith('BFF') || c.startsWith('TFF') || c.startsWith('WFF')) return { category: 'Accessory', subCategory: 'Filler' };
  if (c.startsWith('BEP') || c.startsWith('WEP') || c.startsWith('REP') || c.startsWith('DP') || c.startsWith('BS2') || c.startsWith('TS') || c.startsWith('WS1') || c.startsWith('WS2') || c.startsWith('WS3') || c.startsWith('WS4')) return { category: 'Accessory', subCategory: 'Skin Panel' };
  if (c.startsWith('TK')) return { category: 'Accessory', subCategory: 'Toe Kick' };
  if (c.startsWith('UNIV-ROT') || c.startsWith('ROT')) return { category: 'Accessory', subCategory: 'Roll Out Trays' };
  if (c.startsWith('PG') || (c.startsWith('MD') && !c.startsWith('MDW'))) return { category: 'Accessory', subCategory: 'Glass Door' };
  if (c.startsWith('FFS')) return { category: 'Accessory', subCategory: 'Floating Shelf' };
  if (c.startsWith('VA')) return { category: 'Accessory', subCategory: 'Valance' };
  if (c.startsWith('RHF') || c.startsWith('RH-')) return { category: 'Accessory', subCategory: 'Range Hood' };
  if (c.startsWith('LWR') || c.startsWith('WSC')) return { category: 'Accessory', subCategory: 'Wine Storage' };
  if (c.startsWith('CORB') || c.startsWith('COR-')) return { category: 'Accessory', subCategory: 'Corbel' };
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
    cabinetId = ins.insertId || null;
    if (!cabinetId) {
      const [ex] = await conn.query(`SELECT id FROM cabinets WHERE masterCode = ? LIMIT 1`, [item.masterCode]);
      cabinetId = ex[0]?.id;
    }
    if (cabinetId) {
      cabMap[upperCode] = cabinetId;
      created++;
      newCabinets.push({ masterCode: item.masterCode, desc: item.description.substring(0, 60) });
    } else { skipped++; continue; }
  }

  const platformSku = `${PREFIX}${item.masterCode}`;
  await conn.query(`
    INSERT INTO distributor_skus (distributorId, styleId, cabinetId, platformSku, distributorSku, listPrice, isAvailable, isPublished)
    VALUES (?, ?, ?, ?, ?, ?, 1, 1)
    ON DUPLICATE KEY UPDATE listPrice = VALUES(listPrice), cabinetId = VALUES(cabinetId), isAvailable = 1, isPublished = 1
  `, [DIST_ID, styleId, cabinetId, platformSku, item.distributorSku, item.price.toFixed(2)]);
  inserted++;
}

console.log(`\n=== CC IMPORT COMPLETE ===`);
console.log(`Inserted/updated: ${inserted} | New cabinets: ${created} | Skipped: ${skipped}`);
if (newCabinets.length) {
  console.log(`New cabinets:`);
  for (const c of newCabinets) console.log(`  ${c.masterCode.padEnd(22)} ${c.desc}`);
}

// Dedup
await conn.query(`DELETE dsk1 FROM distributor_skus dsk1 INNER JOIN distributor_skus dsk2 ON dsk1.platformSku = dsk2.platformSku AND dsk1.id < dsk2.id`);
const [dupes] = await conn.query(`SELECT COUNT(*) as cnt FROM (SELECT platformSku FROM distributor_skus GROUP BY platformSku HAVING COUNT(*) > 1) t`);
console.log(`\nDuplicate platformSkus: ${dupes[0].cnt}`);

const [summary] = await conn.query(`SELECT ds.styleCode, ds.ourName, COUNT(dsk.id) as cnt FROM door_styles ds LEFT JOIN distributor_skus dsk ON dsk.styleId = ds.id AND dsk.isAvailable = 1 WHERE ds.distributorId = 2 GROUP BY ds.id, ds.styleCode, ds.ourName ORDER BY ds.styleCode`);
console.log('\nAshford per-style:');
let total = 0;
for (const r of summary) { console.log(`  ${r.styleCode.padEnd(6)} ${r.ourName.padEnd(35)} ${r.cnt}`); total += Number(r.cnt); }
console.log(`  TOTAL: ${total}`);

await conn.end();
