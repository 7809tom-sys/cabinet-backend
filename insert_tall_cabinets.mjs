import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');
const url = process.env.DATABASE_URL || '';
const m = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);
const conn = await mysql.createConnection({ host: m[3], port: +m[4], user: m[1], password: m[2], database: m[5], ssl: { rejectUnauthorized: false } });

// Get ASP style ID
const [[asp]] = await conn.execute("SELECT id FROM door_styles WHERE styleCode = 'ASP' LIMIT 1");
const aspId = asp.id;
console.log('ASP style ID:', aspId);

// Get a distributor ID to use (same as other Clark & Son SKUs)
const [[distRow]] = await conn.execute("SELECT distributorId FROM distributor_skus WHERE styleId = ? LIMIT 1", [aspId]);
const distributorId = distRow?.distributorId;
console.log('Distributor ID:', distributorId);

// Cabinet definitions from catalog image
// Single Door Utility Cabinets (UC) - 18" wide, 24" deep
// Double Door Wide Utility Cabinets (UC) - 24" wide, 24" deep  
// Universal Oven Cabinets (UOC) - 33" wide, 24" deep
const cabinets = [
  // Single Door Utility Cabinets
  { masterCode: 'UC1884', description: '18" Single Door Utility Cabinet', width: 18, height: 84, depth: 24, doors: 1, category: 'Tall', subCategory: 'Utility Cabinet', aspList: 1073.34 },
  { masterCode: 'UC1890', description: '18" Single Door Utility Cabinet', width: 18, height: 90, depth: 24, doors: 1, category: 'Tall', subCategory: 'Utility Cabinet', aspList: 1127.07 },
  { masterCode: 'UC1896', description: '18" Single Door Utility Cabinet', width: 18, height: 96, depth: 24, doors: 1, category: 'Tall', subCategory: 'Utility Cabinet', aspList: 1181.88 },
  // Double Door Wide Utility Cabinets
  { masterCode: 'UC2484', description: '24" Double Door Wide Utility Cabinet', width: 24, height: 84, depth: 24, doors: 2, category: 'Tall', subCategory: 'Utility Cabinet', aspList: 1251.52 },
  { masterCode: 'UC2490', description: '24" Double Door Wide Utility Cabinet', width: 24, height: 90, depth: 24, doors: 2, category: 'Tall', subCategory: 'Utility Cabinet', aspList: 1238.85 },
  { masterCode: 'UC2496', description: '24" Double Door Wide Utility Cabinet', width: 24, height: 96, depth: 24, doors: 2, category: 'Tall', subCategory: 'Utility Cabinet', aspList: 1273.57 },
  // Universal Oven Cabinets
  { masterCode: 'UOC3384', description: '33" Universal Oven Cabinet', width: 33, height: 84, depth: 24, doors: 2, category: 'Tall', subCategory: 'Oven Cabinet', aspList: 1575.87 },
  { masterCode: 'UOC3390', description: '33" Universal Oven Cabinet', width: 33, height: 90, depth: 24, doors: 2, category: 'Tall', subCategory: 'Oven Cabinet', aspList: 1693.97 },
  { masterCode: 'UOC3396', description: '33" Universal Oven Cabinet', width: 33, height: 96, depth: 24, doors: 2, category: 'Tall', subCategory: 'Oven Cabinet', aspList: 1726.71 },
];

// Wholesale = list * 0.55 (standard markup), contractor = list * 0.65, homeowner = list * 0.85
function calcPrices(list) {
  return {
    listPrice: list,
    wholesalePrice: Math.round(list * 0.55 * 100) / 100,
    contractorPrice: Math.round(list * 0.65 * 100) / 100,
    homeownerPrice: Math.round(list * 0.85 * 100) / 100,
    adjustedListPrice: list,
  };
}

for (const cab of cabinets) {
  // Insert cabinet record
  const [insertResult] = await conn.execute(`
    INSERT INTO cabinets (masterCode, description, width, height, depth, numberOfDoors, category, subCategory, isActive, conflictStatus, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'none', NOW(), NOW())
  `, [cab.masterCode, cab.description, cab.width, cab.height, cab.depth, cab.doors, cab.category, cab.subCategory]);
  
  const cabinetId = insertResult.insertId;
  console.log(`Inserted cabinet ${cab.masterCode} with id=${cabinetId}`);

  // Insert ASP SKU
  const prices = calcPrices(cab.aspList);
  await conn.execute(`
    INSERT INTO distributor_skus (cabinetId, styleId, distributorId, listPrice, wholesalePrice, contractorPrice, homeownerPrice, adjustedListPrice, isPublished, isAvailable, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, NOW(), NOW())
  `, [cabinetId, aspId, distributorId, prices.listPrice, prices.wholesalePrice, prices.contractorPrice, prices.homeownerPrice, prices.adjustedListPrice]);
  
  console.log(`  SKU inserted: list=$${prices.listPrice}, wholesale=$${prices.wholesalePrice}`);
}

console.log('\nDone! All 9 tall utility cabinets inserted for Lumina White (ASP).');
await conn.end();
