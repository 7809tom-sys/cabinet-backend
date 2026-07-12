// Add SW-B30 (separate from B30FH) and update all wall cabinet yourCost values
import { createConnection } from 'mysql2/promise';
import * as dotenv from 'dotenv';

dotenv.config({ path: '/home/ubuntu/cabinet-dealz/.env' });

const dbUrl = process.env.DATABASE_URL;
const match = dbUrl.match(/mysql:\/\/([^:]+):([^@]+)@([^:/]+)(?::(\d+))?\/([^?]+)/);
const [, user, pass, host, port, db] = match;

const conn = await createConnection({
  host, port: port ? +port : 3306,
  user, password: pass, database: db,
  ssl: { rejectUnauthorized: false }
});

const DIST_ID = 1;
const STYLE_ID = 30046; // Shaker White (Nova White)

// ── Step 1: Add SW-B30 as a new separate cabinet ─────────────────────────────
// SW-B30 = Shaker White B30 standard base (1 door + 1 drawer, 30"W × 34½"H × 24"D)
// This is DIFFERENT from B30FH (full height door, no drawer)
const [existB30] = await conn.query(
  `SELECT id FROM distributor_skus WHERE distributorId = ? AND distributorSku = 'SW-B30' LIMIT 1`,
  [DIST_ID]
);

if (existB30.length > 0) {
  console.log('SW-B30 already exists, skipping insert');
} else {
  // Check if cabinet masterCode B30 exists (it should - it's a standard base)
  const [cabB30] = await conn.query(`SELECT id FROM cabinets WHERE masterCode = 'B30' LIMIT 1`);
  let cabinetId;
  if (cabB30.length > 0) {
    cabinetId = cabB30[0].id;
    console.log(`Using existing cabinet id=${cabinetId} for B30`);
  } else {
    const [ins] = await conn.query(
      `INSERT INTO cabinets (masterCode, description, descriptionSource, category, subCategory, width, height, depth, placementType, numberOfDoors, numberOfDrawers, priceVerified)
       VALUES ('B30', 'Base Cabinet - 30"W X 34-1/2"H X 24"D - 1 Door, 1 Drawer', 'distributor', 'Base', 'Standard Base', 30, 34.5, 24, 'base', 1, 1, false)`,
    );
    cabinetId = ins.insertId;
    console.log(`Created cabinet id=${cabinetId} for B30`);
  }
  
  await conn.query(
    `INSERT INTO distributor_skus (distributorId, cabinetId, styleId, platformSku, distributorSku, listPrice, yourCost, isPublished, isAvailable, supplierCabinetName)
     VALUES (?, ?, ?, 'B30-30046', 'SW-B30', 238.35, 83.40, true, true, 'Shaker White - Base Cabinet 30"W X 34-1/2"H X 24"D - 1 Door, 1 Drawer')`,
    [DIST_ID, cabinetId, STYLE_ID]
  );
  console.log('ADDED SW-B30: cost=$83.40, list=$238.35');
}

// ── Step 2: Update yourCost for all wall cabinet SKUs ────────────────────────
// Full list from portal (dealer cost | list price)
const wallPrices = [
  // 30"H Single Door
  { sku: 'SW-W0930', cost: 67.20, list: 192.00 },
  { sku: 'SW-W1230', cost: 74.90, list: 214.00 },
  { sku: 'SW-W1530', cost: 87.15, list: 249.00 },
  { sku: 'SW-W1830', cost: 97.30, list: 278.00 },
  { sku: 'SW-W2130', cost: 105.70, list: 302.00 },
  // 30"H Double Door
  { sku: 'SW-W2430', cost: 131.25, list: 375.00 },
  { sku: 'SW-W2730', cost: 140.35, list: 401.00 },
  { sku: 'SW-W3030', cost: 157.15, list: 449.00 },
  { sku: 'SW-W3330', cost: 167.30, list: 478.00 },
  { sku: 'SW-W3630', cost: 178.15, list: 509.00 },
  { sku: 'SW-W3930', cost: 188.65, list: 539.00 },
  // 36"H Single Door
  { sku: 'SW-W0936', cost: 74.55, list: 213.00 },
  { sku: 'SW-W1236', cost: 86.45, list: 247.00 },
  { sku: 'SW-W1536', cost: 97.30, list: 278.00 },
  { sku: 'SW-W1836', cost: 110.60, list: 316.00 },
  { sku: 'SW-W2136', cost: 124.60, list: 356.00 },
  // 36"H Double Door
  { sku: 'SW-W2436', cost: 141.40, list: 404.00 },
  { sku: 'SW-W2736', cost: 152.25, list: 435.00 },
  { sku: 'SW-W3036', cost: 174.65, list: 499.00 },
  { sku: 'SW-W3336', cost: 190.75, list: 545.00 },
  { sku: 'SW-W3636', cost: 202.65, list: 579.00 },
  // 42"H Single Door
  { sku: 'SW-W0942', cost: 84.00, list: 240.00 },
  { sku: 'SW-W1242', cost: 100.10, list: 286.00 },
  { sku: 'SW-W1542', cost: 115.15, list: 329.00 },
  { sku: 'SW-W1842', cost: 131.25, list: 375.00 },
  { sku: 'SW-W2142', cost: 146.30, list: 418.00 },
  // 42"H Double Door
  { sku: 'SW-W2442', cost: 165.20, list: 472.00 },
  { sku: 'SW-W2742', cost: 180.25, list: 515.00 },
  { sku: 'SW-W3042', cost: 207.20, list: 592.00 },
  { sku: 'SW-W3342', cost: 220.50, list: 630.00 },
  { sku: 'SW-W3642', cost: 234.15, list: 669.00 },
  // 12"H Double Door
  { sku: 'SW-W3012', cost: 85.75, list: 245.00 },
  { sku: 'SW-W3312', cost: 91.00, list: 260.00 },
  { sku: 'SW-W3612', cost: 96.60, list: 276.00 },
  // 15"H Double Door
  { sku: 'SW-W3015', cost: 94.15, list: 269.00 },
  { sku: 'SW-W3315', cost: 100.45, list: 287.00 },
  { sku: 'SW-W3615', cost: 106.40, list: 304.00 },
  // 18"H Double Door
  { sku: 'SW-W2418', cost: 100.10, list: 286.00 },
  { sku: 'SW-W3018', cost: 106.75, list: 305.00 },
  { sku: 'SW-W3318', cost: 109.90, list: 314.00 },
  { sku: 'SW-W3618', cost: 114.10, list: 326.00 },
  // 24"H Double Door
  { sku: 'SW-W3024', cost: 128.80, list: 368.00 },
  { sku: 'SW-W3324', cost: 131.95, list: 377.00 },
  { sku: 'SW-W3624', cost: 141.75, list: 405.00 },
  // Glass Door - Single 30"H
  { sku: 'SW-W1530GD', cost: 96.95, list: 277.00 },
  { sku: 'SW-W1830GD', cost: 115.15, list: 329.00 },
  // Glass Door - Single 36"H
  { sku: 'SW-W1536GD', cost: 110.60, list: 316.00 },
  { sku: 'SW-W1836GD', cost: 143.85, list: 411.00 },
  // Glass Door - Double 18"H
  { sku: 'SW-W3018GD', cost: 117.25, list: 335.00 },
  // Glass Door - Single 42"H
  { sku: 'SW-W1542GD', cost: 127.40, list: 364.00 },
  { sku: 'SW-W1842GD', cost: 150.50, list: 430.00 },
  // Glass Door - Double 30"H
  { sku: 'SW-W2430GD', cost: 148.05, list: 423.00 },
  { sku: 'SW-W3030GD', cost: 175.35, list: 501.00 },
  // Glass Door - Double 36"H
  { sku: 'SW-W2436GD', cost: 154.00, list: 440.00 },
  { sku: 'SW-W3036GD', cost: 203.00, list: 580.00 },
  // Glass Door - Double 42"H
  { sku: 'SW-W2442GD', cost: 182.70, list: 522.00 },
  { sku: 'SW-W3042GD', cost: 232.75, list: 665.00 },
  // Glass Door - Single 12"H
  { sku: 'SW-W1212GD', cost: 36.05, list: 103.00 },
  { sku: 'SW-W1512GD', cost: 40.60, list: 116.00 },
  { sku: 'SW-W1812GD', cost: 45.50, list: 130.00 },
  // 24"H Glass Door
  { sku: 'SW-W2412GD', cost: 60.55, list: 173.00 },
];

let updated = 0;
let notFound = [];
let newAdded = 0;

for (const item of wallPrices) {
  const [rows] = await conn.query(
    `SELECT id, distributorSku, yourCost FROM distributor_skus WHERE distributorId = ? AND distributorSku = ? LIMIT 1`,
    [DIST_ID, item.sku]
  );
  
  if (rows.length === 0) {
    notFound.push(item.sku);
    continue;
  }
  
  const row = rows[0];
  const currentCost = row.yourCost ? parseFloat(row.yourCost) : null;
  
  if (currentCost === item.cost) continue;
  
  await conn.query(
    `UPDATE distributor_skus SET yourCost = ? WHERE id = ?`,
    [item.cost, row.id]
  );
  console.log(`  UPDATED ${item.sku}: ${currentCost ?? 'null'} → ${item.cost}`);
  updated++;
}

console.log(`\n=== WALL CABINET SUMMARY ===`);
console.log(`  Updated: ${updated}`);
console.log(`  Not found: ${notFound.length} → ${notFound.join(', ')}`);

await conn.end();
process.exit(0);
