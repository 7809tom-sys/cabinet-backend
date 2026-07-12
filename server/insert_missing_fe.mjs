// Insert missing Floral Espresso SKUs that exist on the portal but not in our DB
import { createConnection } from 'mysql2/promise';
import * as dotenv from 'dotenv';
dotenv.config();

const conn = await createConnection(process.env.DATABASE_URL);

// Get the Floral Espresso style ID and distributor ID
const [styles] = await conn.execute(
  "SELECT id, distributorId FROM door_styles WHERE ourName = 'Floral Espresso' LIMIT 1"
);
if (!styles.length) { console.log('Floral Espresso style not found'); process.exit(1); }
const { id: styleId, distributorId } = styles[0];
console.log(`Floral Espresso: styleId=${styleId}, distributorId=${distributorId}`);

// Missing SKUs from the portal with their prices
const missingSKUs = [
  { sku: 'FE-BFH12', price: 102.20, masterCode: 'BFH12', category: 'Base', subCategory: 'Full Height Base', w: 12, h: 34.5, d: 24 },
  { sku: 'FE-BFH15', price: 113.40, masterCode: 'BFH15', category: 'Base', subCategory: 'Full Height Base', w: 15, h: 34.5, d: 24 },
  { sku: 'FE-BFH18', price: 124.60, masterCode: 'BFH18', category: 'Base', subCategory: 'Full Height Base', w: 18, h: 34.5, d: 24 },
  { sku: 'FE-BFH21', price: 135.80, masterCode: 'BFH21', category: 'Base', subCategory: 'Full Height Base', w: 21, h: 34.5, d: 24 },
  { sku: 'FE-BFH24', price: 154.70, masterCode: 'BFH24', category: 'Base', subCategory: 'Full Height Base', w: 24, h: 34.5, d: 24 },
  { sku: 'FE-BFH27', price: 166.95, masterCode: 'BFH27', category: 'Base', subCategory: 'Full Height Base', w: 27, h: 34.5, d: 24 },
  { sku: 'FE-BFH30', price: 179.55, masterCode: 'BFH30', category: 'Base', subCategory: 'Full Height Base', w: 30, h: 34.5, d: 24 },
  { sku: 'FE-BFH33', price: 191.80, masterCode: 'BFH33', category: 'Base', subCategory: 'Full Height Base', w: 33, h: 34.5, d: 24 },
  { sku: 'FE-BFH36', price: 204.05, masterCode: 'BFH36', category: 'Base', subCategory: 'Full Height Base', w: 36, h: 34.5, d: 24 },
  { sku: 'FE-2DB24', price: 244.30, masterCode: '2DB24', category: 'Base', subCategory: '2-Drawer Base', w: 24, h: 34.5, d: 24 },
  { sku: 'FE-2DB30', price: 274.05, masterCode: '2DB30', category: 'Base', subCategory: '2-Drawer Base', w: 30, h: 34.5, d: 24 },
  { sku: 'FE-2DB36', price: 297.85, masterCode: '2DB36', category: 'Base', subCategory: '2-Drawer Base', w: 36, h: 34.5, d: 24 },
  { sku: 'FE-3DB27', price: 277.20, masterCode: '3DB27', category: 'Base', subCategory: '3-Drawer Base', w: 27, h: 34.5, d: 24 },
  { sku: 'FE-3DB33', price: 308.35, masterCode: '3DB33', category: 'Base', subCategory: '3-Drawer Base', w: 33, h: 34.5, d: 24 },
  { sku: 'FE-3DB30', price: 297.50, masterCode: '3DB30', category: 'Base', subCategory: '3-Drawer Base', w: 30, h: 34.5, d: 24 },
  { sku: 'FE-3DB36', price: 326.90, masterCode: '3DB36', category: 'Base', subCategory: '3-Drawer Base', w: 36, h: 34.5, d: 24 },
  { sku: 'FE-SB27', price: 168.00, masterCode: 'SB27', category: 'Base', subCategory: 'Sink Base', w: 27, h: 34.5, d: 24 },
  { sku: 'FE-FSB36', price: 213.50, masterCode: 'FSB36', category: 'Base', subCategory: 'Farm Sink Base', w: 36, h: 34.5, d: 24 },
  { sku: 'FE-CSB36', price: 223.30, masterCode: 'CSB36', category: 'Base', subCategory: 'Corner Sink Base', w: 36, h: 34.5, d: 24 },
  { sku: 'FE-DCSF42', price: 85.75, masterCode: 'DCSF42', category: 'Accessory', subCategory: 'Filler', w: 3, h: 34.5, d: 24 },
  { sku: 'FE-BEC24', price: 167.30, masterCode: 'BEC24', category: 'Base', subCategory: 'Easy Reach Corner', w: 24, h: 34.5, d: 24 },
  { sku: 'FE-ERB33', price: 225.75, masterCode: 'ERB33', category: 'Base', subCategory: 'Easy Reach Base', w: 33, h: 34.5, d: 24 },
  { sku: 'FE-ERB36', price: 252.00, masterCode: 'ERB36', category: 'Base', subCategory: 'Easy Reach Base', w: 36, h: 34.5, d: 24 },
  { sku: 'FE-BBC36', price: 177.10, masterCode: 'BBC36', category: 'Base', subCategory: 'Blind Corner Base', w: 36, h: 34.5, d: 24 },
  { sku: 'FE-BBC39', price: 215.25, masterCode: 'BBC39', category: 'Base', subCategory: 'Blind Corner Base', w: 39, h: 34.5, d: 24 },
  { sku: 'FE-BBC42', price: 243.95, masterCode: 'BBC42', category: 'Base', subCategory: 'Blind Corner Base', w: 42, h: 34.5, d: 24 },
  { sku: 'FE-BES12', price: 107.10, masterCode: 'BES12', category: 'Base', subCategory: 'Base End Shelf', w: 12, h: 34.5, d: 24 },
  { sku: 'FE-SPB9', price: 157.15, masterCode: 'SPB9', category: 'Base', subCategory: 'Spice Pull-out Base', w: 9, h: 34.5, d: 24 },
  { sku: 'FE-BSDC6', price: 142.80, masterCode: 'BSDC6', category: 'Base', subCategory: 'Base Spice Drawer', w: 6, h: 34.5, d: 24 },
  { sku: 'FE-MB30', price: 237.65, masterCode: 'MB30', category: 'Base', subCategory: 'Microwave Base', w: 30, h: 34.5, d: 24 },
  { sku: 'FE-MB33', price: 251.30, masterCode: 'MB33', category: 'Base', subCategory: 'Microwave Base', w: 33, h: 34.5, d: 24 },
  { sku: 'FE-BWB18', price: 214.90, masterCode: 'BWB18', category: 'Base', subCategory: 'Base Waste Basket', w: 18, h: 34.5, d: 24 },
  { sku: 'FE-DFB18', price: 182.00, masterCode: 'DFB18', category: 'Base', subCategory: 'Drawer File Base', w: 18, h: 34.5, d: 24 },
  { sku: 'FE-W3930', price: 198.10, masterCode: 'W3930', category: 'Wall', subCategory: 'Standard Wall', w: 39, h: 30, d: 12 },
  { sku: 'FE-W3012', price: 91.35, masterCode: 'W3012', category: 'Wall', subCategory: 'Short Wall', w: 30, h: 12, d: 12 },
  { sku: 'FE-W3312', price: 95.90, masterCode: 'W3312', category: 'Wall', subCategory: 'Short Wall', w: 33, h: 12, d: 12 },
  { sku: 'FE-W3612', price: 101.50, masterCode: 'W3612', category: 'Wall', subCategory: 'Short Wall', w: 36, h: 12, d: 12 },
  { sku: 'FE-W3015', price: 102.55, masterCode: 'W3015', category: 'Wall', subCategory: 'Short Wall', w: 30, h: 15, d: 12 },
  { sku: 'FE-W3315', price: 105.70, masterCode: 'W3315', category: 'Wall', subCategory: 'Short Wall', w: 33, h: 15, d: 12 },
  { sku: 'FE-W3615', price: 109.20, masterCode: 'W3615', category: 'Wall', subCategory: 'Short Wall', w: 36, h: 15, d: 12 },
  { sku: 'FE-W2418', price: 100.45, masterCode: 'W2418', category: 'Wall', subCategory: 'Standard Wall', w: 24, h: 18, d: 12 },
  { sku: 'FE-W3018', price: 112.70, masterCode: 'W3018', category: 'Wall', subCategory: 'Standard Wall', w: 30, h: 18, d: 12 },
  { sku: 'FE-W3318', price: 116.20, masterCode: 'W3318', category: 'Wall', subCategory: 'Standard Wall', w: 33, h: 18, d: 12 },
  { sku: 'FE-W3618', price: 122.15, masterCode: 'W3618', category: 'Wall', subCategory: 'Standard Wall', w: 36, h: 18, d: 12 },
  { sku: 'FE-W3024', price: 135.80, masterCode: 'W3024', category: 'Wall', subCategory: 'Standard Wall', w: 30, h: 24, d: 12 },
  { sku: 'FE-W3324', price: 138.60, masterCode: 'W3324', category: 'Wall', subCategory: 'Standard Wall', w: 33, h: 24, d: 12 },
  { sku: 'FE-W3624', price: 159.25, masterCode: 'W3624', category: 'Wall', subCategory: 'Standard Wall', w: 36, h: 24, d: 12 },
  { sku: 'FE-W1530GD', price: 104.65, masterCode: 'W1530GD', category: 'Wall', subCategory: 'Glass Door Wall', w: 15, h: 30, d: 12 },
  { sku: 'FE-W1830GD', price: 121.80, masterCode: 'W1830GD', category: 'Wall', subCategory: 'Glass Door Wall', w: 18, h: 30, d: 12 },
  { sku: 'FE-W1536GD', price: 119.00, masterCode: 'W1536GD', category: 'Wall', subCategory: 'Glass Door Wall', w: 15, h: 36, d: 12 },
  { sku: 'FE-W1836GD', price: 145.60, masterCode: 'W1836GD', category: 'Wall', subCategory: 'Glass Door Wall', w: 18, h: 36, d: 12 },
  { sku: 'FE-W3018GD', price: 123.90, masterCode: 'W3018GD', category: 'Wall', subCategory: 'Glass Door Wall', w: 30, h: 18, d: 12 },
  { sku: 'FE-W1542GD', price: 136.50, masterCode: 'W1542GD', category: 'Wall', subCategory: 'Glass Door Wall', w: 15, h: 42, d: 12 },
  { sku: 'FE-W1842GD', price: 160.65, masterCode: 'W1842GD', category: 'Wall', subCategory: 'Glass Door Wall', w: 18, h: 42, d: 12 },
  { sku: 'FE-W2430GD', price: 155.05, masterCode: 'W2430GD', category: 'Wall', subCategory: 'Glass Door Wall', w: 24, h: 30, d: 12 },
  { sku: 'FE-W3030GD', price: 183.75, masterCode: 'W3030GD', category: 'Wall', subCategory: 'Glass Door Wall', w: 30, h: 30, d: 12 },
  { sku: 'FE-W2436GD', price: 161.35, masterCode: 'W2436GD', category: 'Wall', subCategory: 'Glass Door Wall', w: 24, h: 36, d: 12 },
  { sku: 'FE-W3036GD', price: 214.55, masterCode: 'W3036GD', category: 'Wall', subCategory: 'Glass Door Wall', w: 30, h: 36, d: 12 },
  { sku: 'FE-W2442GD', price: 206.15, masterCode: 'W2442GD', category: 'Wall', subCategory: 'Glass Door Wall', w: 24, h: 42, d: 12 },
  { sku: 'FE-W3042GD', price: 245.00, masterCode: 'W3042GD', category: 'Wall', subCategory: 'Glass Door Wall', w: 30, h: 42, d: 12 },
  { sku: 'FE-W1212GD', price: 41.65, masterCode: 'W1212GD', category: 'Wall', subCategory: 'Glass Door Wall', w: 12, h: 12, d: 12 },
  { sku: 'FE-W1512GD', price: 46.90, masterCode: 'W1512GD', category: 'Wall', subCategory: 'Glass Door Wall', w: 15, h: 12, d: 12 },
  { sku: 'FE-W1812GD', price: 53.90, masterCode: 'W1812GD', category: 'Wall', subCategory: 'Glass Door Wall', w: 18, h: 12, d: 12 },
  { sku: 'FE-W2112GD', price: 59.15, masterCode: 'W2112GD', category: 'Wall', subCategory: 'Glass Door Wall', w: 21, h: 12, d: 12 },
  { sku: 'FE-W2412GD', price: 72.10, masterCode: 'W2412GD', category: 'Wall', subCategory: 'Glass Door Wall', w: 24, h: 12, d: 12 },
  { sku: 'FE-W2712GD', price: 78.40, masterCode: 'W2712GD', category: 'Wall', subCategory: 'Glass Door Wall', w: 27, h: 12, d: 12 },
  { sku: 'FE-W3012GD', price: 98.70, masterCode: 'W3012GD', category: 'Wall', subCategory: 'Glass Door Wall', w: 30, h: 12, d: 12 },
  { sku: 'FE-W3312GD', price: 104.65, masterCode: 'W3312GD', category: 'Wall', subCategory: 'Glass Door Wall', w: 33, h: 12, d: 12 },
  { sku: 'FE-W3612GD', price: 110.95, masterCode: 'W3612GD', category: 'Wall', subCategory: 'Glass Door Wall', w: 36, h: 12, d: 12 },
  { sku: 'FE-W301224', price: 116.20, masterCode: 'W301224', category: 'Wall', subCategory: 'Standard Wall', w: 30, h: 12, d: 24 },
  { sku: 'FE-W301524', price: 126.00, masterCode: 'W301524', category: 'Wall', subCategory: 'Standard Wall', w: 30, h: 15, d: 24 },
];

// Get the cabinetId for each masterCode - check if cabinet exists
let inserted = 0, skipped = 0;
for (const item of missingSKUs) {
  // Check if cabinet with this masterCode exists
  const [cabRows] = await conn.execute(
    'SELECT id FROM cabinets WHERE masterCode = ? LIMIT 1',
    [item.masterCode]
  );
  
  let cabinetId;
  if (cabRows.length > 0) {
    cabinetId = cabRows[0].id;
  } else {
    // Insert the cabinet first
    const desc = `${item.subCategory} Cabinet, ${item.w}"W x ${item.h}"H x ${item.d}"D`;
    const [cabInsert] = await conn.execute(
      `INSERT INTO cabinets (masterCode, description, category, subCategory, widthInches, heightInches, depthInches, isActive, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, NOW())`,
      [item.masterCode, desc, item.category, item.subCategory, item.w, item.h, item.d]
    );
    cabinetId = cabInsert.insertId;
  }
  
  // Check if SKU already exists
  const [existing] = await conn.execute(
    'SELECT id FROM distributor_skus WHERE distributorSku = ? LIMIT 1',
    [item.sku]
  );
  
  if (existing.length > 0) {
    // Update price
    await conn.execute(
      'UPDATE distributor_skus SET yourCost = ? WHERE distributorSku = ?',
      [item.price, item.sku]
    );
    skipped++;
    continue;
  }
  
  // Insert the SKU
  await conn.execute(
    `INSERT INTO distributor_skus 
     (cabinetId, distributorId, styleId, platformSku, distributorSku, yourCost, isAvailable, isPublished, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, 1, 1, NOW())`,
    [cabinetId, distributorId, styleId, item.sku, item.sku, item.price]
  );
  inserted++;
}

await conn.end();
console.log(`Inserted: ${inserted}, Updated existing: ${skipped}`);
