/**
 * Import Oxford White (OW / Oxford Blanc) for Madison (UCD, distributorId=1).
 * Source: US Cabinet Depot Capital Collection (framed cabinets)
 * platformSku prefix: MD_CS_
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
dotenv.config();

const db = await mysql.createConnection(process.env.DATABASE_URL);

const MADISON_DIST_ID = 1;
const STYLE_CODE = 'CS';
const PREFIX = 'MD_CS_';
const DISCOUNT_RATE  = 0.30;
const HOMEOWNER_MUL  = 1.68;
const CONTRACTOR_MUL = 1.29;
const WHOLESALE_MUL  = 1.25;

// Get the door style ID for OW under Madison
const [[style]] = await db.query(
  'SELECT id FROM door_styles WHERE styleCode = ? AND distributorId = ? AND isActive = 1 LIMIT 1',
  [STYLE_CODE, MADISON_DIST_ID]
);
if (!style) throw new Error(`Door style ${STYLE_CODE} not found for Madison`);
const styleId = style.id;
console.log(`Door style ${STYLE_CODE} id=${styleId}`);

// Load parsed items
const items = JSON.parse(readFileSync('/tmp/cs_items.json', 'utf8'));
console.log(`Loaded ${items.length} items to import`);

// Helper: derive master code from OW code
// OW-B12 → B12, UV-SBF4242 → UVSBF4242
function masterCode(code) {
  if (code.startsWith('UV-')) return code.replace('-', '');  // UV-SBF4242 → UVSBF4242
  return code.replace(/^[A-Z]+-/, '');  // OW-B12 → B12
}

// Helper: infer category from master code
function inferCategory(mc) {
  if (/^(B|SB|FSB|BBC|LSB|BER|2DB|3DB|BT|DCF|DCFF|DCSF|UV-SBF|UVSBF)/.test(mc)) return 'Base';
  if (/^(W|WDC|WBC|WER|WBR|WCR|WSC|WOC|MW|PGW)/.test(mc)) return 'Wall';
  if (/^(UC|UT|UCD|OC|OCB|UOC|UCB|TDEP|VDEP)/.test(mc)) return 'Tall';
  if (/^(V|VDB|VB|ADAV)/.test(mc)) return 'Vanity';
  return 'Accessory';
}

let inserted = 0, updated = 0, newCabinets = 0, skipped = 0;

for (const item of items) {
  const mc = masterCode(item.code);
  const platformSku = PREFIX + mc;
  const yourCost = item.price;
  const listPrice = parseFloat((yourCost / DISCOUNT_RATE).toFixed(2));
  const homeownerPrice = parseFloat((yourCost * HOMEOWNER_MUL).toFixed(2));
  const contractorPrice = parseFloat((yourCost * CONTRACTOR_MUL).toFixed(2));
  const wholesalePrice = parseFloat((yourCost * WHOLESALE_MUL).toFixed(2));

  // Find or create cabinet
  let [[cabinet]] = await db.query('SELECT id FROM cabinets WHERE masterCode = ? LIMIT 1', [mc]);
  if (!cabinet) {
    const category = inferCategory(mc);
    const [ins] = await db.query(
      'INSERT INTO cabinets (masterCode, description, category) VALUES (?, ?, ?)',
      [mc, mc, category]
    );
    cabinet = { id: ins.insertId };
    newCabinets++;
  }

  // Check for existing SKU
  const [[existing]] = await db.query(
    'SELECT id FROM distributor_skus WHERE platformSku = ? LIMIT 1',
    [platformSku]
  );

  if (existing) {
    await db.query(
      `UPDATE distributor_skus SET styleId=?, listPrice=?, yourCost=?, homeownerPrice=?, contractorPrice=?, wholesalePrice=?, isAvailable=1, isPublished=1 WHERE id=?`,
      [styleId, listPrice, yourCost, homeownerPrice, contractorPrice, wholesalePrice, existing.id]
    );
    updated++;
  } else {
    await db.query(
      `INSERT INTO distributor_skus (platformSku, distributorSku, cabinetId, distributorId, styleId, listPrice, yourCost, homeownerPrice, contractorPrice, wholesalePrice, isAvailable, isPublished)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)`,
      [platformSku, item.code, cabinet.id, MADISON_DIST_ID, styleId, listPrice, yourCost, homeownerPrice, contractorPrice, wholesalePrice]
    );
    inserted++;
  }
}

console.log(`\nDone: ${inserted} inserted, ${updated} updated, ${newCabinets} new cabinets, ${skipped} skipped`);

// Check for duplicates
const [[dupes]] = await db.query(
  'SELECT COUNT(*) as cnt FROM (SELECT platformSku FROM distributor_skus GROUP BY platformSku HAVING COUNT(*) > 1) t'
);
console.log(`Duplicate platformSkus: ${dupes.cnt}`);

// Sample
const [sample] = await db.query(
  'SELECT platformSku, listPrice, yourCost, homeownerPrice FROM distributor_skus WHERE platformSku LIKE ? LIMIT 3',
  [PREFIX + '%']
);
for (const r of sample) {
  console.log(`  ${r.platformSku}: list=$${r.listPrice} | cost=$${r.yourCost} | homeowner=$${r.homeownerPrice}`);
}

await db.end();
