// Update/add Shaker White Accessories costs
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

// All accessory SKUs from portal (SW-* ones only; RS/Wood Tray/Chrome Tray are non-style-specific)
const accessories = [
  // Wall Spice Drawer
  { sku: 'SW-WSD630', baseCode: 'WSD630', desc: 'Wall Spice Drawer - 30"W X 6"H X 12"D', w: 30, h: 6, d: 12, cat: 'Accessory', sub: 'Wall Spice Drawer', placement: 'wall', cost: 91.70, list: 262.00 },
  // Fluted Tall Filler
  { sku: 'SW-FF396', baseCode: 'FF396', desc: 'Fluted Tall Filler - 3"W X 96"H', w: 3, h: 96, d: 0.75, cat: 'Accessory', sub: 'Filler', placement: 'accessory/trim', cost: 50.75, list: 145.00 },
  // Fillers
  { sku: 'SW-F342', baseCode: 'F342', desc: 'Wall Filler - 3"W X 42"H', w: 3, h: 42, d: 0.75, cat: 'Accessory', sub: 'Filler', placement: 'accessory/trim', cost: 13.30, list: 38.00 },
  { sku: 'SW-F642', baseCode: 'F642', desc: 'Wall Filler - 6"W X 42"H', w: 6, h: 42, d: 0.75, cat: 'Accessory', sub: 'Filler', placement: 'accessory/trim', cost: 25.90, list: 74.00 },
  { sku: 'SW-F396', baseCode: 'F396', desc: 'Tall Filler - 3"W X 96"H', w: 3, h: 96, d: 0.75, cat: 'Accessory', sub: 'Filler', placement: 'accessory/trim', cost: 44.80, list: 128.00 },
  { sku: 'SW-F696', baseCode: 'F696', desc: 'Tall Filler - 6"W X 96"H', w: 6, h: 96, d: 0.75, cat: 'Accessory', sub: 'Filler', placement: 'accessory/trim', cost: 66.85, list: 191.00 },
  // Toe Kick
  { sku: 'SW-TKC', baseCode: 'TKC', desc: 'Toe Kick 8ft Plywood - 1/4"D X 4-1/2"H X 96"W', w: 96, h: 4.5, d: 0.25, cat: 'Accessory', sub: 'Toe Kick', placement: 'accessory/trim', cost: 13.30, list: 38.00 },
  // Decorative Door Panels
  { sku: 'SW-BDEP', baseCode: 'BDEP', desc: 'Base Decorative Door Panel - 23-1/2"W X 29"H X 3/4"D', w: 23.5, h: 29, d: 0.75, cat: 'Accessory', sub: 'Decorative End Panel', placement: 'tall', cost: 82.25, list: 235.00 },
  { sku: 'SW-WDEP30', baseCode: 'WDEP30', desc: 'Wall Decorative Door Panel - 12-3/4"W X 29"H X 3/4"D', w: 12.75, h: 29, d: 0.75, cat: 'Accessory', sub: 'Decorative End Panel', placement: 'wall', cost: 36.75, list: 105.00 },
  { sku: 'SW-WDEP36', baseCode: 'WDEP36', desc: 'Wall Decorative Door Panel - 12-3/4"W X 35"H X 3/4"D', w: 12.75, h: 35, d: 0.75, cat: 'Accessory', sub: 'Decorative End Panel', placement: 'wall', cost: 41.65, list: 119.00 },
  { sku: 'SW-WDEP42', baseCode: 'WDEP42', desc: 'Wall Decorative Door Panel - 12-3/4"W X 41"H X 3/4"D', w: 12.75, h: 41, d: 0.75, cat: 'Accessory', sub: 'Decorative End Panel', placement: 'wall', cost: 46.90, list: 134.00 },
  { sku: 'SW-TDEP2484', baseCode: 'TDEP2484', desc: 'Tall Decorative Door Panel - 23-1/2"W X 78-1/2"H X 3/4"D', w: 23.5, h: 78.5, d: 0.75, cat: 'Accessory', sub: 'Decorative End Panel', placement: 'tall', cost: 194.25, list: 555.00 },
  { sku: 'SW-TDEP2490', baseCode: 'TDEP2490', desc: 'Tall Decorative Door Panel - 23-1/2"W X 84-1/2"H X 3/4"D', w: 23.5, h: 84.5, d: 0.75, cat: 'Accessory', sub: 'Decorative End Panel', placement: 'tall', cost: 205.10, list: 586.00 },
  { sku: 'SW-TDEP2496', baseCode: 'TDEP2496', desc: 'Tall Decorative Door Panel - 23-1/2"W X 90-1/2"H X 3/4"D', w: 23.5, h: 90.5, d: 0.75, cat: 'Accessory', sub: 'Decorative End Panel', placement: 'tall', cost: 225.75, list: 645.00 },
  // Refrigerator End Panels
  { sku: 'SW-REPV2496', baseCode: 'REPV2496', desc: 'Refrigerator End Panel - 1-1/2"W X 96"H X 24"D Plywood With 1-1/2"W Filler', w: 1.5, h: 96, d: 24, cat: 'Accessory', sub: 'Decorative End Panel', placement: 'tall', cost: 80.15, list: 229.00 },
  { sku: 'SW-REPV2796', baseCode: 'REPV2796', desc: 'Refrigerator End Panel - 1-1/2"W X 96"H X 27"D Plywood With 1-1/2"W Filler', w: 1.5, h: 96, d: 27, cat: 'Accessory', sub: 'Decorative End Panel', placement: 'tall', cost: 98.35, list: 281.00 },
  // Dishwasher Return Panel
  { sku: 'SW-DWR3', baseCode: 'DWR3', desc: 'Dishwasher Return Panel - 3"W X 34-1/2"H X 24"D Plywood With 3"W Filler', w: 3, h: 34.5, d: 24, cat: 'Accessory', sub: 'Decorative End Panel', placement: 'base', cost: 45.85, list: 131.00 },
  // Skin Panels
  { sku: 'SW-BSV', baseCode: 'BSV', desc: 'Base Skin Panel - 1/4"D X 34-1/2"H X 23-1/4"W', w: 23.25, h: 34.5, d: 0.25, cat: 'Accessory', sub: 'Skin Panel', placement: 'accessory/trim', cost: 17.15, list: 49.00 },
  { sku: 'SW-WSV42', baseCode: 'WSV42', desc: 'Wall Skin Panel - 1/4"D X 42"H X 15"W', w: 15, h: 42, d: 0.25, cat: 'Accessory', sub: 'Skin Panel', placement: 'accessory/trim', cost: 10.85, list: 31.00 },
  { sku: 'SW-USV2496', baseCode: 'USV2496', desc: 'Tall Skin Panel - 1/4"D X 96"H X 23-1/4"W', w: 23.25, h: 96, d: 0.25, cat: 'Tall', sub: 'Skin Panel', placement: 'accessory/trim', cost: 35.70, list: 102.00 },
  { sku: 'SW-FPV4296', baseCode: 'FPV4296', desc: 'Finished Plywood Panel - 42"W X 96"H X 1/4"D', w: 42, h: 96, d: 0.25, cat: 'Accessory', sub: 'Skin Panel', placement: 'accessory/trim', cost: 57.75, list: 165.00 },
  // Shelf Board
  { sku: 'SW-S2496', baseCode: 'S2496', desc: 'Shelf Board - 3/4"D X 96"H X 24"W', w: 24, h: 96, d: 0.75, cat: 'Accessory', sub: 'Shelf', placement: 'accessory/trim', cost: 77.70, list: 222.00 },
  // Crown Mouldings
  { sku: 'SW-COV', baseCode: 'COV', desc: 'Cove Crown Moulding - 3-1/2"D X 3-5/8"H X 96"W', w: 96, h: 3.625, d: 3.5, cat: 'Accessory', sub: 'Crown Molding', placement: 'accessory/trim', cost: 81.55, list: 233.00 },
  { sku: 'SW-CM8', baseCode: 'CM8', desc: 'Crown Moulding - 2-1/8"D X 1-7/8"H X 96"W', w: 96, h: 1.875, d: 2.125, cat: 'Accessory', sub: 'Crown Molding', placement: 'accessory/trim', cost: 53.55, list: 153.00 },
  { sku: 'SW-ACM8', baseCode: 'ACM8', desc: 'Angle Crown Moulding - 2-1/2"D X 2-1/2"H X 96"W', w: 96, h: 2.5, d: 2.5, cat: 'Accessory', sub: 'Crown Molding', placement: 'accessory/trim', cost: 49.00, list: 140.00 },
  { sku: 'SW-ALRM8', baseCode: 'ALRM8', desc: 'Angle Light Rail Moulding - 2"D X 96"W', w: 96, h: 2, d: 2, cat: 'Accessory', sub: 'Light Rail', placement: 'accessory/trim', cost: 75.60, list: 216.00 },
  { sku: 'SW-LRM8', baseCode: 'LRM8', desc: 'Light Rail Moulding - 2-1/4"H X 3/4"D X 96"W', w: 96, h: 2.25, d: 0.75, cat: 'Accessory', sub: 'Light Rail', placement: 'accessory/trim', cost: 56.35, list: 161.00 },
  { sku: 'SW-OCM8', baseCode: 'OCM8', desc: 'Outside Corner Moulding - 96"W X 3/4"H X 1/8"D', w: 96, h: 0.75, d: 0.125, cat: 'Accessory', sub: 'Crown Molding', placement: 'accessory/trim', cost: 12.95, list: 37.00 },
  { sku: 'SW-ROPE', baseCode: 'ROPE', desc: 'Rope Moulding - 3/8"D X 3/4"H X 96"W', w: 96, h: 0.75, d: 0.375, cat: 'Accessory', sub: 'Crown Molding', placement: 'accessory/trim', cost: 16.10, list: 46.00 },
  { sku: 'SW-DMTIS', baseCode: 'DMTIS', desc: 'Dentil Moulding - 3/8"D X 11/16"H X 96"W', w: 96, h: 0.6875, d: 0.375, cat: 'Accessory', sub: 'Crown Molding', placement: 'accessory/trim', cost: 13.30, list: 38.00 },
  { sku: 'SW-FBM', baseCode: 'FBM', desc: 'Furniture Base Moulding - 3/4"D X 4-1/2"H X 96"W', w: 96, h: 4.5, d: 0.75, cat: 'Accessory', sub: 'Crown Molding', placement: 'accessory/trim', cost: 62.30, list: 178.00 },
  { sku: 'SW-BCM8(DCM)', baseCode: 'BCM8DCM', desc: 'Decorative Crown Moulding - 2-3/8"D X 3-17/32"H X 96"W', w: 96, h: 3.53125, d: 2.375, cat: 'Accessory', sub: 'Crown Molding', placement: 'accessory/trim', cost: 63.35, list: 181.00 },
  { sku: 'SW-RCM4S(LCM)', baseCode: 'RCM4SLCM', desc: 'Inset Crown Moulding - 2-1/2"D X 3-5/16"H X 96"W', w: 96, h: 3.3125, d: 2.5, cat: 'Accessory', sub: 'Crown Molding', placement: 'accessory/trim', cost: 59.50, list: 170.00 },
  { sku: 'SW-SHM', baseCode: 'SHM', desc: 'Shoe Moulding - 11/16"D X 11/16"H X 96"W', w: 96, h: 0.6875, d: 0.6875, cat: 'Accessory', sub: 'Crown Molding', placement: 'accessory/trim', cost: 10.85, list: 31.00 },
  { sku: 'SW-SM8(SCR)', baseCode: 'SM8SCR', desc: 'Scribe Moulding - 1/4"D X 3/4"H X 96"W', w: 96, h: 0.75, d: 0.25, cat: 'Accessory', sub: 'Scribe Molding', placement: 'accessory/trim', cost: 12.25, list: 35.00 },
  { sku: 'SW-BAM', baseCode: 'BAM', desc: 'Batten Moulding - 1/4"D X 3/4"H X 96"W', w: 96, h: 0.75, d: 0.25, cat: 'Accessory', sub: 'Batten', placement: 'accessory/trim', cost: 13.65, list: 39.00 },
  // Corbels
  { sku: 'SW-CB9', baseCode: 'CB9', desc: 'Corbel - 3"W X 9"H X 9"D', w: 3, h: 9, d: 9, cat: 'Accessory', sub: 'Corbel', placement: 'accessory/trim', cost: 14.00, list: 40.00 },
  { sku: 'SW-CBT', baseCode: 'CBT', desc: 'Corbel - 3-1/8"W X 13-1/16"H X 5-7/8"D', w: 3.125, h: 13.0625, d: 5.875, cat: 'Accessory', sub: 'Corbel', placement: 'accessory/trim', cost: 62.30, list: 178.00 },
  // Decorative Legs
  { sku: 'SW-CLDL', baseCode: 'CLDL', desc: 'Classic Decorative Leg - 3"W X 3"D X 34-1/2"H', w: 3, h: 34.5, d: 3, cat: 'Accessory', sub: 'Decorative Leg', placement: 'accessory/trim', cost: 91.35, list: 261.00 },
  { sku: 'SW-FLDL', baseCode: 'FLDL', desc: 'Fluted Decorative Leg - 3"W X 3"D X 34-1/2"H', w: 3, h: 34.5, d: 3, cat: 'Accessory', sub: 'Decorative Leg', placement: 'accessory/trim', cost: 93.10, list: 266.00 },
  // Valances
  { sku: 'SW-VA30', baseCode: 'VA30', desc: 'Arched Valance - 3/4"D X 6"H X 30"W', w: 30, h: 6, d: 0.75, cat: 'Accessory', sub: 'Valance', placement: 'accessory/trim', cost: 37.80, list: 108.00 },
  { sku: 'SW-VA36', baseCode: 'VA36', desc: 'Arched Valance - 3/4"D X 6"H X 36"W', w: 36, h: 6, d: 0.75, cat: 'Accessory', sub: 'Valance', placement: 'accessory/trim', cost: 44.80, list: 128.00 },
  { sku: 'SW-VA42', baseCode: 'VA42', desc: 'Arched Valance - 3/4"D X 6"H X 42"W', w: 42, h: 6, d: 0.75, cat: 'Accessory', sub: 'Valance', placement: 'accessory/trim', cost: 51.10, list: 146.00 },
  { sku: 'SW-VA48', baseCode: 'VA48', desc: 'Arched Valance - 3/4"D X 6"H X 48"W', w: 48, h: 6, d: 0.75, cat: 'Accessory', sub: 'Valance', placement: 'accessory/trim', cost: 53.90, list: 154.00 },
  // Corner Sink Base Floor
  { sku: 'SW-SBF4242', baseCode: 'SBF4242', desc: 'Corner Sink Front Floor - 42"W - Goes With DCSF42', w: 42, h: 4.5, d: 24, cat: 'Accessory', sub: 'Sink Accessory', placement: 'accessory/trim', cost: 31.85, list: 91.00 },
  // Glass Holder
  { sku: 'SW-SGH30', baseCode: 'SGH30', desc: 'Stem Wine Glass Holder - 30"W X 1-1/2"H X 12"D', w: 30, h: 1.5, d: 12, cat: 'Accessory', sub: 'Glass Holder', placement: 'accessory/trim', cost: 44.45, list: 127.00 },
  // Knee Drawer
  { sku: 'SW-VKD36', baseCode: 'VKD36', desc: 'Knee Drawer - 36"W X 7"H X 21"D', w: 36, h: 7, d: 21, cat: 'Accessory', sub: 'Drawer', placement: 'accessory/trim', cost: 60.90, list: 174.00 },
  // Vanity Base Decorative Door Panel
  { sku: 'SW-VDEP', baseCode: 'VDEP', desc: 'Vanity Base Decorative Door Panel - 20-1/2"W X 29"H', w: 20.5, h: 29, d: 0.75, cat: 'Accessory', sub: 'Decorative End Panel', placement: 'accessory/trim', cost: 77.35, list: 221.00 },
  // Floating Shelves
  { sku: 'SW-FS24', baseCode: 'FS24', desc: 'Floating Shelf - 24"W X 2-1/16"H X 12"D', w: 24, h: 2.0625, d: 12, cat: 'Accessory', sub: 'Floating Shelf', placement: 'accessory/trim', cost: 63.70, list: 182.00 },
  { sku: 'SW-FS30', baseCode: 'FS30', desc: 'Floating Shelf - 30"W X 2-1/16"H X 12"D', w: 30, h: 2.0625, d: 12, cat: 'Accessory', sub: 'Floating Shelf', placement: 'accessory/trim', cost: 70.70, list: 202.00 },
];

let updated = 0;
let added = 0;
let skipped = 0;

for (const item of accessories) {
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
    console.log(`Using existing cabinet id=${cabinetId} for ${item.baseCode}`);
  } else {
    const [ins] = await conn.query(
      `INSERT INTO cabinets (masterCode, description, descriptionSource, category, subCategory, width, height, depth, placementType, numberOfDoors, numberOfDrawers, priceVerified)
       VALUES (?, ?, 'distributor', ?, ?, ?, ?, ?, ?, 0, 0, false)`,
      [item.baseCode, item.desc, item.cat, item.sub, item.w, item.h, item.d, item.placement]
    );
    cabinetId = ins.insertId;
    console.log(`Created cabinet id=${cabinetId} for ${item.baseCode}`);
  }

  await conn.query(
    `INSERT INTO distributor_skus (distributorId, cabinetId, styleId, platformSku, distributorSku, listPrice, yourCost, isPublished, isAvailable, supplierCabinetName)
     VALUES (?, ?, ?, ?, ?, ?, ?, true, true, ?)`,
    [DIST_ID, cabinetId, STYLE_ID, `${item.baseCode}-30046`, item.sku, item.list, item.cost, `Shaker White - ${item.desc}`]
  );
  console.log(`ADDED ${item.sku}: cost=${item.cost}, list=${item.list}`);
  added++;
}

console.log(`\n=== ACCESSORIES SUMMARY ===`);
console.log(`  Updated: ${updated}, Added: ${added}, Already correct: ${skipped}`);

await conn.end();
process.exit(0);
