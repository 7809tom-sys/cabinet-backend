// Update/add Shaker White Oven & Pantry cabinet costs
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
const STYLE_ID = 30046; // Shaker White

// All Oven & Pantry SKUs from portal
const tallItems = [
  // 30"W Utility Pantry
  { sku: 'SW-U308424', baseCode: 'U308424', desc: 'Utility Pantry - 30"W X 24"D X 84"H - 2 Adj Top Shelves, 3 Bottom Shelves', w: 30, h: 84, d: 24, placement: 'tall', doors: 2, drawers: 0, cost: 472.50, list: 1350.00 },
  { sku: 'SW-U309024', baseCode: 'U309024', desc: 'Utility Pantry - 30"W X 24"D X 90"H - 2 Adj Top Shelves, 3 Bottom Shelves', w: 30, h: 90, d: 24, placement: 'tall', doors: 2, drawers: 0, cost: 504.70, list: 1442.00 },
  { sku: 'SW-U309624', baseCode: 'U309624', desc: 'Utility Pantry - 30"W X 24"D X 96"H - 2 Adj Top Shelves, 3 Bottom Shelves', w: 30, h: 96, d: 24, placement: 'tall', doors: 2, drawers: 0, cost: 530.95, list: 1517.00 },
  // 18"W Utility Pantry
  { sku: 'SW-U188424', baseCode: 'U188424', desc: 'Utility Pantry - 18"W X 24"D X 84"H - 2 Adj Top Shelves, 3 Bottom Shelves', w: 18, h: 84, d: 24, placement: 'tall', doors: 1, drawers: 0, cost: 362.95, list: 1037.00 },
  { sku: 'SW-U189024', baseCode: 'U189024', desc: 'Utility Pantry - 18"W X 24"D X 90"H - 2 Adj Top Shelves, 3 Bottom Shelves', w: 18, h: 90, d: 24, placement: 'tall', doors: 1, drawers: 0, cost: 375.20, list: 1072.00 },
  { sku: 'SW-U189624', baseCode: 'U189624', desc: 'Utility Pantry - 18"W X 24"D X 96"H - 2 Adj Top Shelves, 3 Bottom Shelves', w: 18, h: 96, d: 24, placement: 'tall', doors: 1, drawers: 0, cost: 393.75, list: 1125.00 },
  // 24"W Utility Pantry
  { sku: 'SW-U248424', baseCode: 'U248424', desc: 'Wall Pantry - 24"W X 84"H X 24"D - 4 Doors, 5 Shelves', w: 24, h: 84, d: 24, placement: 'tall', doors: 4, drawers: 0, cost: 399.00, list: 1140.00 },
  { sku: 'SW-U249024', baseCode: 'U249024', desc: 'Wall Pantry - 24"W X 90"H X 24"D - 4 Doors, 5 Shelves', w: 24, h: 90, d: 24, placement: 'tall', doors: 4, drawers: 0, cost: 431.20, list: 1232.00 },
  { sku: 'SW-U249624', baseCode: 'U249624', desc: 'Wall Pantry - 24"W X 96"H X 24"D - 4 Doors, 5 Shelves', w: 24, h: 96, d: 24, placement: 'tall', doors: 4, drawers: 0, cost: 459.20, list: 1312.00 },
  // 30"W Oven Pantry
  { sku: 'SW-O308424', baseCode: 'O308424', desc: 'Oven Pantry - 30"W X 84"H X 24"D - Opening 24"W X 24-3/8"H - 2 Doors, 3 Bottom Drawers', w: 30, h: 84, d: 24, placement: 'tall', doors: 2, drawers: 3, cost: 562.10, list: 1606.00 },
  { sku: 'SW-O309024', baseCode: 'O309024', desc: 'Oven Pantry - 30"W X 90"H X 24"D - Opening 24"W X 24-3/8"H - 2 Doors, 3 Bottom Drawers', w: 30, h: 90, d: 24, placement: 'tall', doors: 2, drawers: 3, cost: 568.75, list: 1625.00 },
  { sku: 'SW-O309624', baseCode: 'O309624', desc: 'Oven Pantry - 30"W X 96"H X 24"D - Opening 24"W X 24-3/8"H - 2 Doors, 3 Bottom Drawers', w: 30, h: 96, d: 24, placement: 'tall', doors: 2, drawers: 3, cost: 611.10, list: 1746.00 },
  // 33"W Oven Pantry
  { sku: 'SW-O338424', baseCode: 'O338424', desc: 'Oven Pantry - 33"W X 84"H X 24"D - Opening 24"W X 24-3/8"H - 2 Doors, 3 Bottom Drawers', w: 33, h: 84, d: 24, placement: 'tall', doors: 2, drawers: 3, cost: 565.60, list: 1616.00 },
  { sku: 'SW-O339024', baseCode: 'O339024', desc: 'Oven Pantry - 33"W X 90"H X 24"D - Opening 24"W X 24-3/8"H - 2 Doors, 3 Bottom Drawers', w: 33, h: 90, d: 24, placement: 'tall', doors: 2, drawers: 3, cost: 592.90, list: 1694.00 },
  { sku: 'SW-O339624', baseCode: 'O339624', desc: 'Oven Pantry - 33"W X 96"H X 24"D - Opening 24"W X 24-3/8"H - 2 Doors, 3 Bottom Drawers', w: 33, h: 96, d: 24, placement: 'tall', doors: 2, drawers: 3, cost: 645.75, list: 1845.00 },
];

let updated = 0;
let added = 0;
let skipped = 0;

for (const item of tallItems) {
  const [existing] = await conn.query(
    `SELECT id, yourCost FROM distributor_skus WHERE distributorId = ? AND distributorSku = ? LIMIT 1`,
    [DIST_ID, item.sku]
  );

  if (existing.length > 0) {
    const row = existing[0];
    const currentCost = row.yourCost ? parseFloat(row.yourCost) : null;
    if (currentCost === item.cost) { skipped++; continue; }
    await conn.query(`UPDATE distributor_skus SET yourCost = ? WHERE id = ?`, [item.cost, row.id]);
    console.log(`UPDATED ${item.sku}: ${currentCost ?? 'null'} → ${item.cost}`);
    updated++;
    continue;
  }

  // Not found — add it
  const [cabRows] = await conn.query(`SELECT id FROM cabinets WHERE masterCode = ? LIMIT 1`, [item.baseCode]);
  let cabinetId;
  if (cabRows.length > 0) {
    cabinetId = cabRows[0].id;
  } else {
    const [ins] = await conn.query(
      `INSERT INTO cabinets (masterCode, description, descriptionSource, category, subCategory, width, height, depth, placementType, numberOfDoors, numberOfDrawers, priceVerified)
       VALUES (?, ?, 'distributor', 'Tall', 'Pantry', ?, ?, ?, ?, ?, ?, false)`,
      [item.baseCode, item.desc, item.w, item.h, item.d, item.placement, item.doors, item.drawers]
    );
    cabinetId = ins.insertId;
  }

  await conn.query(
    `INSERT INTO distributor_skus (distributorId, cabinetId, styleId, platformSku, distributorSku, listPrice, yourCost, isPublished, isAvailable, supplierCabinetName)
     VALUES (?, ?, ?, ?, ?, ?, ?, true, true, ?)`,
    [DIST_ID, cabinetId, STYLE_ID, `${item.baseCode}-30046`, item.sku, item.list, item.cost, `Shaker White - ${item.desc}`]
  );
  console.log(`ADDED ${item.sku}: cost=${item.cost}, list=${item.list}`);
  added++;
}

console.log(`\n=== TALL/PANTRY SUMMARY ===`);
console.log(`  Updated: ${updated}, Added: ${added}, Already correct: ${skipped}`);

await conn.end();
process.exit(0);
