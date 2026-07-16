/**
 * Import Madison (US Cabinet Depot) Shaker White (SW) SKUs
 * Distributor ID: 1 (Madison)
 * Style Code: SW
 * Prefix: MD_SW_
 */
import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';

const DIST_ID = 1;
const STYLE_CODE = 'SW';
const PREFIX = 'MD_SW_';
const ITEMS_FILE = '/home/ubuntu/sw_items.json';

function inferCategory(masterCode) {
  const code = masterCode.toUpperCase();
  if (code.startsWith('W') || code.startsWith('WDC') || code.startsWith('WBC') || code.startsWith('WBB') || code.startsWith('WEB')) return 'Wall';
  if (code.startsWith('UC') || code.startsWith('UT') || code.startsWith('OC') || code.startsWith('OBC') || code.startsWith('PBC') || code.startsWith('PTC') || code.startsWith('PT') || code.startsWith('OP')) return 'Tall';
  if (code.startsWith('V') || code.startsWith('SDV')) return 'Vanity';
  if (code.match(/^(LS|ROT|UNIV|BF|TF|BFF|TFF|WFF|IS|OCS|SAMPLE|DISPLAY|KIOSK|DCFF|DCSF|UV-|SBF|VDEP|VDSP|VDLP|VDRP|VDEP|VDSP|B12-D|B15-D|B18-D)/)) return 'Accessory';
  return 'Base';
}

function inferSubCategory(masterCode, description) {
  const code = masterCode.toUpperCase();
  const desc = (description || '').toLowerCase();
  if (code.startsWith('SB') || desc.includes('sink base')) return 'Sink Base';
  if (code.startsWith('FSB') || desc.includes('farm sink')) return 'Farm Sink Base';
  if (code.startsWith('DB') || code.startsWith('3DB') || code.startsWith('2DB') || desc.includes('drawer base')) return 'Drawer Base';
  if (code.startsWith('BBC') || desc.includes('blind')) return 'Blind Corner Base';
  if (code.startsWith('BT') || desc.includes('tray base')) return 'Tray Base';
  if (code.startsWith('FHB') || code.endsWith('FH') || desc.includes('full height')) return 'Full Height Base';
  if (code.startsWith('BER') || code.startsWith('LSB') || desc.includes('easy reach')) return 'Corner Base';
  if (code.startsWith('BMC') || desc.includes('microwave')) return 'Microwave Base';
  if (code.startsWith('B')) return 'Standard Base';
  if (code.startsWith('WDC') || desc.includes('diagonal corner wall')) return 'Corner Wall';
  if (code.startsWith('WBC') || desc.includes('blind corner wall')) return 'Blind Corner Wall';
  if (code.startsWith('W')) return 'Standard Wall';
  if (code.startsWith('UC') || code.startsWith('UT')) return 'Utility Cabinet';
  if (code.startsWith('OC') || code.startsWith('OBC') || code.startsWith('OP')) return 'Oven Cabinet';
  if (code.startsWith('PBC') || code.startsWith('PTC') || code.startsWith('PT')) return 'Pantry Cabinet';
  if (code.startsWith('V') || code.startsWith('SDV')) return 'Vanity Base';
  return 'Accessory';
}

async function run() {
  const items = JSON.parse(readFileSync(ITEMS_FILE, 'utf8'));
  console.log(`Loaded ${items.length} SW items`);

  const db = await mysql.createConnection(process.env.DATABASE_URL);

  // Find style
  const [styleRows] = await db.query(
    'SELECT id, ourName FROM door_styles WHERE distributorId = ? AND styleCode = ?',
    [DIST_ID, STYLE_CODE]
  );
  if (!styleRows.length) throw new Error(`Style ${STYLE_CODE} not found for distributor ${DIST_ID}`);
  const styleId = styleRows[0].id;
  const styleName = styleRows[0].ourName;
  console.log(`Style: id=${styleId}, ourName="${styleName}"`);

  // Delete existing SKUs for this style
  const [del] = await db.query('DELETE FROM distributor_skus WHERE distributorId = ? AND styleId = ?', [DIST_ID, styleId]);
  console.log(`Deleted ${del.affectedRows} existing SKUs`);

  let inserted = 0, newCabinets = 0, skipped = 0;
  const newCabinetList = [];

  for (const item of items) {
    const { distributorSku, masterCode, description, price } = item;

    // Skip display/sample items with $0 or very low price
    if (price <= 0) { skipped++; continue; }

    // Find or create cabinet
    let [cabRows] = await db.query('SELECT id FROM cabinets WHERE masterCode = ?', [masterCode]);
    let cabinetId;
    if (cabRows.length) {
      cabinetId = cabRows[0].id;
    } else {
      const category = inferCategory(masterCode);
      const subCategory = inferSubCategory(masterCode, description);
      const [ins] = await db.query(
        'INSERT INTO cabinets (masterCode, description, category, subCategory) VALUES (?, ?, ?, ?)',
        [masterCode, description, category, subCategory]
      );
      cabinetId = ins.insertId;
      newCabinets++;
      newCabinetList.push({ masterCode, description });
    }

    const platformSku = PREFIX + masterCode;
    await db.query(
      `INSERT INTO distributor_skus (platformSku, distributorSku, cabinetId, styleId, distributorId, listPrice, isAvailable, isPublished)
       VALUES (?, ?, ?, ?, ?, ?, 1, 1)
       ON DUPLICATE KEY UPDATE distributorSku=VALUES(distributorSku), listPrice=VALUES(listPrice), isAvailable=1, isPublished=1`,
      [platformSku, distributorSku, cabinetId, styleId, DIST_ID, price]
    );
    inserted++;
  }

  // Check for duplicates
  const [dupes] = await db.query(
    'SELECT COUNT(*) as cnt FROM distributor_skus WHERE platformSku IN (SELECT platformSku FROM distributor_skus GROUP BY platformSku HAVING COUNT(*) > 1)'
  );

  console.log(`\n=== SW IMPORT COMPLETE ===`);
  console.log(`Inserted/updated: ${inserted} | New cabinets: ${newCabinets} | Skipped: ${skipped}`);
  if (newCabinetList.length) {
    console.log('New cabinets:');
    for (const c of newCabinetList) console.log(`  ${c.masterCode.padEnd(25)} ${c.description}`);
  }
  console.log(`Duplicate platformSkus: ${dupes[0].cnt}`);

  // Per-style summary for Madison
  const [summary] = await db.query(
    `SELECT ds.styleCode, ds.ourName, COUNT(sk.id) as cnt
     FROM door_styles ds
     LEFT JOIN distributor_skus sk ON sk.styleId = ds.id AND sk.isAvailable = 1
     WHERE ds.distributorId = ?
     GROUP BY ds.id ORDER BY ds.styleCode`,
    [DIST_ID]
  );
  console.log('\nMadison per-style:');
  let total = 0;
  for (const r of summary) {
    console.log(`  ${r.styleCode.padEnd(6)} ${r.ourName.padEnd(35)} ${r.cnt}`);
    total += Number(r.cnt);
  }
  console.log(`  TOTAL: ${total}`);

  await db.end();
}

run().catch(console.error);
