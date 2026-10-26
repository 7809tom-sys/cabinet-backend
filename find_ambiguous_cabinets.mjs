import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// 1. Cabinets with no approved distributor SKUs at all (orphaned/unused)
const [noSkus] = await conn.query(`
  SELECT c.id, c.masterCode, c.description, c.category, c.subCategory
  FROM cabinets c
  LEFT JOIN distributor_skus ds ON ds.cabinetId = c.id AND ds.status = 'approved'
  WHERE ds.id IS NULL
    AND c.conflictStatus = 'none'
    AND c.isActive = 1
  ORDER BY c.category, c.masterCode
  LIMIT 200
`);
console.log(`\n=== Cabinets with NO approved distributor SKUs: ${noSkus.length} ===`);
for (const r of noSkus) {
  console.log(`  [${r.id}] ${r.masterCode} | ${r.category} | ${r.subCategory || ''} | ${r.description.substring(0, 60)}`);
}

// 2. Cabinets with NULL or empty category
const [noCategory] = await conn.query(`
  SELECT id, masterCode, description, category, subCategory
  FROM cabinets
  WHERE (category IS NULL OR category = '')
    AND conflictStatus = 'none'
    AND isActive = 1
  LIMIT 50
`);
console.log(`\n=== Cabinets with NULL/empty category: ${noCategory.length} ===`);
for (const r of noCategory) {
  console.log(`  [${r.id}] ${r.masterCode} | ${r.description.substring(0, 60)}`);
}

// 3. Cabinets with NULL placementType (can't be placed in designer)
const [noPlacement] = await conn.query(`
  SELECT id, masterCode, description, category, subCategory, placementType
  FROM cabinets
  WHERE placementType IS NULL
    AND conflictStatus = 'none'
    AND isActive = 1
  ORDER BY category, masterCode
  LIMIT 200
`);
console.log(`\n=== Cabinets with NULL placementType: ${noPlacement.length} ===`);
for (const r of noPlacement) {
  console.log(`  [${r.id}] ${r.masterCode} | ${r.category} | ${r.subCategory || ''} | ${r.description.substring(0, 60)}`);
}

// 4. Accessory/Trim cabinets with ambiguous category
const [accessories] = await conn.query(`
  SELECT id, masterCode, description, category, subCategory, placementType
  FROM cabinets
  WHERE category IN ('Accessory', 'Trim', 'Panel', 'Filler', 'Molding', 'Accessory/Trim')
    AND conflictStatus = 'none'
    AND isActive = 1
  ORDER BY category, masterCode
  LIMIT 200
`);
console.log(`\n=== Accessory/Trim/Panel/Filler/Molding cabinets: ${accessories.length} ===`);
for (const r of accessories) {
  console.log(`  [${r.id}] ${r.masterCode} | ${r.category} | ${r.subCategory || ''} | ${r.description.substring(0, 60)}`);
}

// 5. Cabinets with unusual/unknown subCategory values
const [unusualSub] = await conn.query(`
  SELECT subCategory, COUNT(*) as cnt
  FROM cabinets
  WHERE conflictStatus = 'none' AND isActive = 1
  GROUP BY subCategory
  ORDER BY cnt ASC
  LIMIT 30
`);
console.log(`\n=== Rare subCategory values (possible ambiguous) ===`);
for (const r of unusualSub) {
  console.log(`  "${r.subCategory || 'NULL'}": ${r.cnt} cabinets`);
}

// 6. Cabinets already in conflict
const [alreadyConflict] = await conn.query(`
  SELECT COUNT(*) as cnt FROM cabinets WHERE conflictStatus = 'conflict'
`);
console.log(`\n=== Already in conflict: ${alreadyConflict[0].cnt} ===`);

await conn.end();
