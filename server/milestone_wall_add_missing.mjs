// Add 8 missing Shaker White wall cabinet SKUs
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

// Missing wall cabinet SKUs from the portal
const missingWall = [
  // 12"H Double Door (33" and 33")
  { sku: 'SW-W3312', baseCode: 'W3312', desc: 'Wall Cabinet Double Door - 33"W X 12"H X 12"D With 2 Door', w: 33, h: 12, d: 12, placement: 'wall', doors: 2, drawers: 0, cost: 91.00, list: 260.00 },
  // 15"H Double Door (33")
  { sku: 'SW-W3315', baseCode: 'W3315', desc: 'Wall Cabinet Double Door - 33"W X 15"H X 12"D With 2 Door', w: 33, h: 15, d: 12, placement: 'wall', doors: 2, drawers: 0, cost: 100.45, list: 287.00 },
  // 18"H Double Door
  { sku: 'SW-W2418', baseCode: 'W2418', desc: 'Wall Cabinet Double Door - 24"W X 18"H X 12"D With 2 Door', w: 24, h: 18, d: 12, placement: 'wall', doors: 2, drawers: 0, cost: 100.10, list: 286.00 },
  { sku: 'SW-W3318', baseCode: 'W3318', desc: 'Wall Cabinet Double Door - 33"W X 18"H X 12"D With 2 Door', w: 33, h: 18, d: 12, placement: 'wall', doors: 2, drawers: 0, cost: 109.90, list: 314.00 },
  // 24"H Double Door (33")
  { sku: 'SW-W3324', baseCode: 'W3324', desc: 'Wall Cabinet Double Door - 33"W X 24"H X 12"D With 2 Door', w: 33, h: 24, d: 12, placement: 'wall', doors: 2, drawers: 0, cost: 131.95, list: 377.00 },
  // Glass Door - Single 30"H (18")
  { sku: 'SW-W1830GD', baseCode: 'W1830GD', desc: 'Wall Glass Door Cabinet With Finished Interior - 18"W X 30"H X 12"D - 1 Door, 2 Shelf - Clear Glass Included', w: 18, h: 30, d: 12, placement: 'wall', doors: 1, drawers: 0, cost: 115.15, list: 329.00 },
  // Glass Door - Single 36"H (18")
  { sku: 'SW-W1836GD', baseCode: 'W1836GD', desc: 'Wall Glass Door Cabinet With Finished Interior - 18"W X 36"H X 12"D - 1 Door, 2 Shelf - Clear Glass Included', w: 18, h: 36, d: 12, placement: 'wall', doors: 1, drawers: 0, cost: 143.85, list: 411.00 },
  // Glass Door - Single 42"H (18")
  { sku: 'SW-W1842GD', baseCode: 'W1842GD', desc: 'Wall Glass Door Cabinet With Finished Interior - 18"W X 42"H X 12"D - 1 Door, 3 Shelf - Clear Glass Included', w: 18, h: 42, d: 12, placement: 'wall', doors: 1, drawers: 0, cost: 150.50, list: 430.00 },
];

let added = 0;
let skipped = 0;

for (const item of missingWall) {
  // Check if already exists
  const [existing] = await conn.query(
    `SELECT id FROM distributor_skus WHERE distributorId = ? AND distributorSku = ? LIMIT 1`,
    [DIST_ID, item.sku]
  );
  if (existing.length > 0) {
    console.log(`SKIP ${item.sku} - already exists`);
    skipped++;
    continue;
  }

  // Find or create the master cabinet record
  const [cabRows] = await conn.query(
    `SELECT id FROM cabinets WHERE masterCode = ? LIMIT 1`,
    [item.baseCode]
  );

  let cabinetId;
  if (cabRows.length > 0) {
    cabinetId = cabRows[0].id;
    console.log(`Using existing cabinet id=${cabinetId} for ${item.baseCode}`);
  } else {
    const [ins] = await conn.query(
      `INSERT INTO cabinets (masterCode, description, descriptionSource, category, subCategory, width, height, depth, placementType, numberOfDoors, numberOfDrawers, priceVerified)
       VALUES (?, ?, 'distributor', 'Wall', 'Standard Wall', ?, ?, ?, ?, ?, ?, false)`,
      [item.baseCode, item.desc, item.w, item.h, item.d, item.placement, item.doors, item.drawers]
    );
    cabinetId = ins.insertId;
    console.log(`Created cabinet id=${cabinetId} for ${item.baseCode}`);
  }

  const platformSku = `${item.baseCode}-30046`;

  await conn.query(
    `INSERT INTO distributor_skus (distributorId, cabinetId, styleId, platformSku, distributorSku, listPrice, yourCost, isPublished, isAvailable, supplierCabinetName)
     VALUES (?, ?, ?, ?, ?, ?, ?, true, true, ?)`,
    [DIST_ID, cabinetId, STYLE_ID, platformSku, item.sku, item.list, item.cost, `Shaker White - ${item.desc}`]
  );

  console.log(`ADDED ${item.sku}: cost=${item.cost}, list=${item.list}`);
  added++;
}

console.log(`\n=== DONE ===`);
console.log(`  Added: ${added}, Skipped: ${skipped}`);

await conn.end();
process.exit(0);
