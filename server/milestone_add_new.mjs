// Add new Shaker White SKUs and update costs for existing ones with different codes
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

// ── Step 1: Find the Shaker White door style ID ──────────────────────────────
const [styles] = await conn.query(
  `SELECT id, ourName, distributorName, distributorId FROM door_styles WHERE distributorId = 1 AND (ourName LIKE '%Shaker%White%' OR distributorName LIKE '%Shaker%White%' OR ourName LIKE '%SW%') LIMIT 5`
);
console.log('Door styles:', JSON.stringify(styles));

// Also check what style the existing SW-B12 uses
const [existingStyle] = await conn.query(
  `SELECT ds.styleId, dst.ourName, dst.distributorName FROM distributor_skus ds 
   JOIN door_styles dst ON dst.id = ds.styleId
   WHERE ds.distributorSku = 'SW-B12' AND ds.distributorId = 1 LIMIT 1`
);
console.log('SW-B12 style:', JSON.stringify(existingStyle));

// ── Step 2: Get the style ID and a sample cabinet to understand the schema ──
const [sampleSku] = await conn.query(
  `SELECT ds.*, c.masterCode, c.description, c.category, c.subCategory, c.width, c.height, c.depth, c.placementType, c.numberOfDoors, c.numberOfDrawers
   FROM distributor_skus ds
   JOIN cabinets c ON c.id = ds.cabinetId
   WHERE ds.distributorSku = 'SW-B12' AND ds.distributorId = 1 LIMIT 1`
);
if (sampleSku.length > 0) {
  const s = sampleSku[0];
  console.log('\nSample SW-B12 row:');
  console.log(`  cabinetId=${s.cabinetId} styleId=${s.styleId} platformSku=${s.platformSku}`);
  console.log(`  cabinet: masterCode=${s.masterCode} cat=${s.category} sub=${s.subCategory} w=${s.width} h=${s.height} d=${s.depth} placement=${s.placementType} doors=${s.numberOfDoors} drawers=${s.numberOfDrawers}`);
}

// ── Step 3: Update costs for existing SKUs with different codes ──────────────
const costUpdates = [
  { distSku: 'BEC24', newCost: 157.15 },   // SW-BEC24 = $157.15 (was $159.85)
  { distSku: 'DFB18', newCost: 169.75 },   // SW-DFB18 = $169.75 (was $168.59)
];

for (const u of costUpdates) {
  const [rows] = await conn.query(
    `SELECT id, yourCost FROM distributor_skus WHERE distributorId = 1 AND distributorSku = ? LIMIT 3`,
    [u.distSku]
  );
  for (const r of rows) {
    await conn.query(`UPDATE distributor_skus SET yourCost = ? WHERE id = ?`, [u.newCost, r.id]);
    console.log(`Updated ${u.distSku} id=${r.id}: cost ${r.yourCost} → ${u.newCost}`);
  }
}

// ── Step 4: Check if new SKUs already exist (avoid duplicates) ──────────────
const newSkus = [
  { sku: 'SW-BT09', desc: 'Base Tray - 9"W X 24"D X 34-1/2"H With 1 Door', w: 9, h: 34.5, d: 24, placement: 'base', doors: 1, drawers: 0, cost: 96.95, list: 277.00 },
  { sku: 'SW-BFH12', desc: 'Base Cabinet Full Height Door - 12"W X 34-1/2"H X 24"D - 1 Door, 1 Shelf', w: 12, h: 34.5, d: 24, placement: 'base', doors: 1, drawers: 0, cost: 97.30, list: 278.00 },
  { sku: 'SW-BFH24', desc: 'Base Cabinet Full Height Door - 24"W X 34-1/2"H X 24"D - 2 Doors, 1 Shelf', w: 24, h: 34.5, d: 24, placement: 'base', doors: 2, drawers: 0, cost: 147.70, list: 422.00 },
  { sku: 'SW-SB27', desc: 'Sink Base - 27"W X 34-1/2"H X 24"D - 1 False Drawer', w: 27, h: 34.5, d: 24, placement: 'base', doors: 2, drawers: 0, cost: 159.60, list: 456.00 },
  { sku: 'SW-CSB36', desc: 'Corner Sink Base Cabinet - 36"W X 24"D X 34-1/2"H With 1 Door And 1 Dummy Drawer', w: 36, h: 34.5, d: 24, placement: 'base', doors: 1, drawers: 0, cost: 211.05, list: 603.00 },
  { sku: 'SW-ERB33', desc: 'Easy Reach Base Cabinet - 33"W X 24"D X 34-1/2"H With 1 Door And Shelf', w: 33, h: 34.5, d: 24, placement: 'base', doors: 1, drawers: 0, cost: 214.90, list: 614.00 },
  { sku: 'SW-BES12', desc: 'Base End Shelf - 12"W X 24"D X 34-1/2"H', w: 12, h: 34.5, d: 24, placement: 'base', doors: 0, drawers: 0, cost: 102.20, list: 292.00 },
  { sku: 'SW-SPB6', desc: 'Spice Pull Base Cabinet - 6"W X 34-1/2"H X 24"D', w: 6, h: 34.5, d: 24, placement: 'base', doors: 1, drawers: 0, cost: 131.25, list: 375.00 },
  { sku: 'SW-BSDC6', desc: 'Base Spice Drawer Cabinet - 6"W X 24"D X 34-1/2"H - 5 Drawers', w: 6, h: 34.5, d: 24, placement: 'base', doors: 0, drawers: 5, cost: 135.45, list: 387.00 },
  { sku: 'SW-MB30', desc: 'Microwave Base Cabinet - 30"W X 34-1/2"H X 24"D', w: 30, h: 34.5, d: 24, placement: 'base', doors: 2, drawers: 1, cost: 224.35, list: 641.00 },
  { sku: 'SW-BWB18', desc: 'Base Waste Basket Cabinet - 18"W X 34-1/2"H X 24"D', w: 18, h: 34.5, d: 24, placement: 'base', doors: 1, drawers: 0, cost: 204.75, list: 585.00 },
];

// Get the styleId and a reference cabinetId pattern from existing SW-B12
const styleId = existingStyle.length > 0 ? existingStyle[0].styleId : null;
console.log(`\nUsing styleId=${styleId} for new SKUs`);

if (!styleId) {
  console.error('Cannot find Shaker White style ID - aborting new SKU insertion');
  await conn.end();
  process.exit(1);
}

// Get the door style's distributorName for supplierCabinetName prefix
const styleName = existingStyle[0]?.distributorName || 'Shaker White';

let added = 0;
let skipped = 0;

for (const item of newSkus) {
  // Check if already exists
  const [existing] = await conn.query(
    `SELECT id FROM distributor_skus WHERE distributorId = 1 AND distributorSku = ? LIMIT 1`,
    [item.sku]
  );
  if (existing.length > 0) {
    console.log(`SKIP ${item.sku} - already exists`);
    skipped++;
    continue;
  }
  
  // Create masterCode from SKU (strip SW- prefix)
  const baseCode = item.sku.replace('SW-', '');
  
  // Check if cabinet with this masterCode exists
  const [cabRows] = await conn.query(
    `SELECT id FROM cabinets WHERE masterCode = ? LIMIT 1`,
    [baseCode]
  );
  
  let cabinetId;
  if (cabRows.length > 0) {
    cabinetId = cabRows[0].id;
    console.log(`Using existing cabinet id=${cabinetId} for ${baseCode}`);
  } else {
    // Insert new cabinet record
    const [insertResult] = await conn.query(
      `INSERT INTO cabinets (masterCode, description, descriptionSource, category, subCategory, width, height, depth, placementType, numberOfDoors, numberOfDrawers, priceVerified)
       VALUES (?, ?, 'distributor', 'Base', ?, ?, ?, ?, ?, ?, ?, false)`,
      [
        baseCode,
        item.desc,
        item.placement === 'base' ? 'Base Cabinet' : 'Cabinet',
        item.w, item.h, item.d,
        item.placement,
        item.doors,
        item.drawers
      ]
    );
    cabinetId = insertResult.insertId;
    console.log(`Created cabinet id=${cabinetId} for ${baseCode}`);
  }
  
  // Generate platformSku: baseCode-styleCode-distCode
  // Look at existing pattern: B12-30046 → platformSku=B12-30046
  // From the earlier output: SW-B12 → platform=B12-30046
  const platformSku = `${baseCode}-30046`;
  
  // Insert distributor_sku record
  await conn.query(
    `INSERT INTO distributor_skus (distributorId, cabinetId, styleId, platformSku, distributorSku, listPrice, yourCost, isPublished, isAvailable, supplierCabinetName)
     VALUES (1, ?, ?, ?, ?, ?, ?, true, true, ?)`,
    [cabinetId, styleId, platformSku, item.sku, item.list, item.cost, `${styleName} - ${item.desc}`]
  );
  
  console.log(`ADDED ${item.sku} (platform=${platformSku}) cost=${item.cost} list=${item.list}`);
  added++;
}

console.log(`\n=== DONE ===`);
console.log(`  Added: ${added}`);
console.log(`  Skipped (already exist): ${skipped}`);
console.log(`  Cost updates: ${costUpdates.length}`);

await conn.end();
process.exit(0);
