import { createConnection } from 'mysql2/promise';
import * as dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/cabinet-dealz/.env' });

const conn = await createConnection(process.env.DATABASE_URL);

// Get the Floral White style ID and distributor ID
const [styles] = await conn.execute(
  "SELECT id, distributorId FROM door_styles WHERE id = 180020 LIMIT 1"
);
if (!styles.length) { console.log('Floral White style not found'); process.exit(1); }
const { id: styleId, distributorId } = styles[0];
console.log(`Floral White: styleId=${styleId}, distributorId=${distributorId}`);

// Missing SKUs from the portal (SW- prefix on portal = FW- in our DB)
const missingSKUs = [
  // Full Height Base (BFH series)
  { sku: 'FW-BFH12', price: 97.3, masterCode: 'BFH12', category: 'Base', subCategory: 'Full Height Base', w: 12, h: 34.5, d: 24 },
  { sku: 'FW-BFH15', price: 107.8, masterCode: 'BFH15', category: 'Base', subCategory: 'Full Height Base', w: 15, h: 34.5, d: 24 },
  { sku: 'FW-BFH18', price: 119.0, masterCode: 'BFH18', category: 'Base', subCategory: 'Full Height Base', w: 18, h: 34.5, d: 24 },
  { sku: 'FW-BFH21', price: 129.5, masterCode: 'BFH21', category: 'Base', subCategory: 'Full Height Base', w: 21, h: 34.5, d: 24 },
  { sku: 'FW-BFH24', price: 147.7, masterCode: 'BFH24', category: 'Base', subCategory: 'Full Height Base', w: 24, h: 34.5, d: 24 },
  { sku: 'FW-BFH27', price: 158.9, masterCode: 'BFH27', category: 'Base', subCategory: 'Full Height Base', w: 27, h: 34.5, d: 24 },
  { sku: 'FW-BFH30', price: 171.15, masterCode: 'BFH30', category: 'Base', subCategory: 'Full Height Base', w: 30, h: 34.5, d: 24 },
  { sku: 'FW-BFH33', price: 182.7, masterCode: 'BFH33', category: 'Base', subCategory: 'Full Height Base', w: 33, h: 34.5, d: 24 },
  { sku: 'FW-BFH36', price: 194.6, masterCode: 'BFH36', category: 'Base', subCategory: 'Full Height Base', w: 36, h: 34.5, d: 24 },
  // 2-Drawer Base
  { sku: 'FW-2DB24', price: 232.4, masterCode: '2DB24', category: 'Base', subCategory: '2-Drawer Base', w: 24, h: 34.5, d: 24 },
  { sku: 'FW-2DB30', price: 260.75, masterCode: '2DB30', category: 'Base', subCategory: '2-Drawer Base', w: 30, h: 34.5, d: 24 },
  { sku: 'FW-2DB36', price: 283.5, masterCode: '2DB36', category: 'Base', subCategory: '2-Drawer Base', w: 36, h: 34.5, d: 24 },
  // 3-Drawer Base (additional sizes)
  { sku: 'FW-3DB27', price: 267.75, masterCode: '3DB27', category: 'Base', subCategory: '3-Drawer Base', w: 27, h: 34.5, d: 24 },
  { sku: 'FW-3DB30', price: 283.15, masterCode: '3DB30', category: 'Base', subCategory: '3-Drawer Base', w: 30, h: 34.5, d: 24 },
  { sku: 'FW-3DB33', price: 297.15, masterCode: '3DB33', category: 'Base', subCategory: '3-Drawer Base', w: 33, h: 34.5, d: 24 },
  { sku: 'FW-3DB36', price: 308.0, masterCode: '3DB36', category: 'Base', subCategory: '3-Drawer Base', w: 36, h: 34.5, d: 24 },
  // Sink Base
  { sku: 'FW-SB27', price: 159.6, masterCode: 'SB27', category: 'Base', subCategory: 'Sink Base', w: 27, h: 34.5, d: 24 },
  // Farm Sink Base
  { sku: 'FW-FSB36', price: 201.95, masterCode: 'FSB36', category: 'Base', subCategory: 'Farm Sink Base', w: 36, h: 34.5, d: 24 },
  // Corner Sink Base
  { sku: 'FW-CSB36', price: 211.05, masterCode: 'CSB36', category: 'Base', subCategory: 'Corner Sink Base', w: 36, h: 34.5, d: 24 },
  // Diagonal Corner Shelf Filler
  { sku: 'FW-DCSF42', price: 80.15, masterCode: 'DCSF42', category: 'Accessory', subCategory: 'Filler', w: 3, h: 34.5, d: 24 },
  // Easy Reach Corner Base
  { sku: 'FW-BEC24', price: 157.15, masterCode: 'BEC24', category: 'Base', subCategory: 'Easy Reach Corner', w: 24, h: 34.5, d: 24 },
  // Easy Reach Base
  { sku: 'FW-ERB33', price: 214.9, masterCode: 'ERB33', category: 'Base', subCategory: 'Easy Reach Base', w: 33, h: 34.5, d: 24 },
  { sku: 'FW-ERB36', price: 238.35, masterCode: 'ERB36', category: 'Base', subCategory: 'Easy Reach Base', w: 36, h: 34.5, d: 24 },
  // Blind Corner Base
  { sku: 'FW-BBC36', price: 167.65, masterCode: 'BBC36', category: 'Base', subCategory: 'Blind Corner Base', w: 36, h: 34.5, d: 24 },
  { sku: 'FW-BBC39', price: 203.0, masterCode: 'BBC39', category: 'Base', subCategory: 'Blind Corner Base', w: 39, h: 34.5, d: 24 },
  { sku: 'FW-BBC42', price: 233.45, masterCode: 'BBC42', category: 'Base', subCategory: 'Blind Corner Base', w: 42, h: 34.5, d: 24 },
  // Base End Shelf
  { sku: 'FW-BES12', price: 102.2, masterCode: 'BES12', category: 'Base', subCategory: 'Base End Shelf', w: 12, h: 34.5, d: 24 },
  // Spice Pull-out Base
  { sku: 'FW-SPB6', price: 131.25, masterCode: 'SPB6', category: 'Base', subCategory: 'Spice Pull-out Base', w: 6, h: 34.5, d: 24 },
  { sku: 'FW-SPB9', price: 149.45, masterCode: 'SPB9', category: 'Base', subCategory: 'Spice Pull-out Base', w: 9, h: 34.5, d: 24 },
  // Base Spice Drawer Cabinet
  { sku: 'FW-BSDC6', price: 135.45, masterCode: 'BSDC6', category: 'Base', subCategory: 'Base Spice Drawer', w: 6, h: 34.5, d: 24 },
  // Microwave Base
  { sku: 'FW-MB30', price: 224.35, masterCode: 'MB30', category: 'Base', subCategory: 'Microwave Base', w: 30, h: 34.5, d: 24 },
  { sku: 'FW-MB33', price: 238.0, masterCode: 'MB33', category: 'Base', subCategory: 'Microwave Base', w: 33, h: 34.5, d: 24 },
  // Drawer File Base
  { sku: 'FW-DFB18', price: 169.75, masterCode: 'DFB18', category: 'Base', subCategory: 'Drawer File Base', w: 18, h: 34.5, d: 24 },
  // Wall cabinets - additional sizes
  { sku: 'FW-W3315', price: 100.45, masterCode: 'W3315', category: 'Wall', subCategory: 'Short Wall', w: 33, h: 15, d: 12 },
  { sku: 'FW-W2418', price: 100.1, masterCode: 'W2418', category: 'Wall', subCategory: 'Standard Wall', w: 24, h: 18, d: 12 },
  // Glass Door Wall cabinets
  { sku: 'FW-W1530GD', price: 96.95, masterCode: 'W1530GD', category: 'Wall', subCategory: 'Glass Door Wall', w: 15, h: 30, d: 12 },
  { sku: 'FW-W1830GD', price: 115.15, masterCode: 'W1830GD', category: 'Wall', subCategory: 'Glass Door Wall', w: 18, h: 30, d: 12 },
  { sku: 'FW-W1536GD', price: 110.6, masterCode: 'W1536GD', category: 'Wall', subCategory: 'Glass Door Wall', w: 15, h: 36, d: 12 },
  { sku: 'FW-W1836GD', price: 143.85, masterCode: 'W1836GD', category: 'Wall', subCategory: 'Glass Door Wall', w: 18, h: 36, d: 12 },
  { sku: 'FW-W3018GD', price: 117.25, masterCode: 'W3018GD', category: 'Wall', subCategory: 'Glass Door Wall', w: 30, h: 18, d: 12 },
  { sku: 'FW-W1542GD', price: 127.4, masterCode: 'W1542GD', category: 'Wall', subCategory: 'Glass Door Wall', w: 15, h: 42, d: 12 },
  { sku: 'FW-W1842GD', price: 150.5, masterCode: 'W1842GD', category: 'Wall', subCategory: 'Glass Door Wall', w: 18, h: 42, d: 12 },
  { sku: 'FW-W2430GD', price: 148.05, masterCode: 'W2430GD', category: 'Wall', subCategory: 'Glass Door Wall', w: 24, h: 30, d: 12 },
  { sku: 'FW-W3030GD', price: 175.35, masterCode: 'W3030GD', category: 'Wall', subCategory: 'Glass Door Wall', w: 30, h: 30, d: 12 },
  { sku: 'FW-W2436GD', price: 154.0, masterCode: 'W2436GD', category: 'Wall', subCategory: 'Glass Door Wall', w: 24, h: 36, d: 12 },
  { sku: 'FW-W3036GD', price: 203.0, masterCode: 'W3036GD', category: 'Wall', subCategory: 'Glass Door Wall', w: 30, h: 36, d: 12 },
  { sku: 'FW-W2442GD', price: 182.7, masterCode: 'W2442GD', category: 'Wall', subCategory: 'Glass Door Wall', w: 24, h: 42, d: 12 },
  { sku: 'FW-W3042GD', price: 232.75, masterCode: 'W3042GD', category: 'Wall', subCategory: 'Glass Door Wall', w: 30, h: 42, d: 12 },
  { sku: 'FW-W1212GD', price: 36.05, masterCode: 'W1212GD', category: 'Wall', subCategory: 'Glass Door Wall', w: 12, h: 12, d: 12 },
  { sku: 'FW-W1512GD', price: 40.6, masterCode: 'W1512GD', category: 'Wall', subCategory: 'Glass Door Wall', w: 15, h: 12, d: 12 },
  { sku: 'FW-W1812GD', price: 45.5, masterCode: 'W1812GD', category: 'Wall', subCategory: 'Glass Door Wall', w: 18, h: 12, d: 12 },
  { sku: 'FW-W2112GD', price: 50.05, masterCode: 'W2112GD', category: 'Wall', subCategory: 'Glass Door Wall', w: 21, h: 12, d: 12 },
  { sku: 'FW-W2412GD', price: 60.55, masterCode: 'W2412GD', category: 'Wall', subCategory: 'Glass Door Wall', w: 24, h: 12, d: 12 },
  { sku: 'FW-W2712GD', price: 65.1, masterCode: 'W2712GD', category: 'Wall', subCategory: 'Glass Door Wall', w: 27, h: 12, d: 12 },
  { sku: 'FW-W3012GD', price: 93.1, masterCode: 'W3012GD', category: 'Wall', subCategory: 'Glass Door Wall', w: 30, h: 12, d: 12 },
  { sku: 'FW-W3312GD', price: 99.75, masterCode: 'W3312GD', category: 'Wall', subCategory: 'Glass Door Wall', w: 33, h: 12, d: 12 },
  { sku: 'FW-W3612GD', price: 105.7, masterCode: 'W3612GD', category: 'Wall', subCategory: 'Glass Door Wall', w: 36, h: 12, d: 12 },
  // Wall cabinet with 24" depth
  { sku: 'FW-W301224', price: 110.95, masterCode: 'W301224', category: 'Wall', subCategory: 'Standard Wall', w: 30, h: 12, d: 24 },
];

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
    console.log(`Created cabinet: ${item.masterCode} (id=${cabinetId})`);
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
