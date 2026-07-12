/**
 * Fix cabinet categories for ADA-* and other miscategorized cabinets.
 * ADA base cabinets should be in Base category, not Accessory.
 * ADA wall cabinets should be in Wall category, not Accessory.
 * ADA sink bases should be in Base / Sink Base.
 * etc.
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const conn = await mysql.createConnection(process.env.DATABASE_URL);

let updated = 0;

// Helper to update a cabinet's category/subCategory
async function fixCabinet(masterCode, category, subCategory, placementType) {
  const [result] = await conn.execute(
    `UPDATE cabinets SET category = ?, subCategory = ?, placementType = ? WHERE masterCode = ?`,
    [category, subCategory, placementType, masterCode]
  );
  if (result.affectedRows > 0) {
    updated++;
    console.log(`  Fixed: ${masterCode} -> ${category} / ${subCategory} (${placementType})`);
  }
}

// ===== ADA Base Cabinets =====
// ADA-B* = ADA base cabinets (single door)
const adaBaseSingle = ['ADA-BT09', 'ADA-B12', 'ADA-B15', 'ADA-B18', 'ADA-B21', 'ADA-B24', 'ADA-B27', 'ADA-B30', 'ADA-B33', 'ADA-B36'];
for (const code of adaBaseSingle) {
  await fixCabinet(code, 'Base', 'Single Door Base', 'base');
}

// ADA-3DB* = ADA 3-drawer base
const adaDrawerBase = ['ADA-3DB12', 'ADA-3DB15', 'ADA-3DB18', 'ADA-3DB21', 'ADA-3DB24'];
for (const code of adaDrawerBase) {
  await fixCabinet(code, 'Base', 'Drawer Base', 'base');
}

// ADA-3VDB* = ADA vanity drawer base
const adaVanityDrawer = ['ADA-3VDB12', 'ADA-3VDB15', 'ADA-3VDB18'];
for (const code of adaVanityDrawer) {
  await fixCabinet(code, 'Vanity', 'Vanity Drawer Base', 'base');
}

// ADA-SB* = ADA sink base
const adaSinkBase = ['ADA-SB33R', 'ADA-SB36R'];
for (const code of adaSinkBase) {
  await fixCabinet(code, 'Base', 'Sink Base', 'base');
}

// BWB18 = Base with wine bottle rack
await fixCabinet('BWB18', 'Base', 'Standard Base', 'base');

// B39, SB39 = wider base cabinets
await fixCabinet('B39', 'Base', 'Single Door Base', 'base');
await fixCabinet('SB39', 'Base', 'Sink Base', 'base');

// 3VDB* = Vanity drawer base (not ADA)
const vanityDrawer = ['3VDB12', '3VDB15', '3VDB18'];
for (const code of vanityDrawer) {
  await fixCabinet(code, 'Vanity', 'Vanity Drawer Base', 'base');
}

// Check what "Wall / null" cabinets are
const [wallNull] = await conn.execute(
  `SELECT masterCode, description, category, subCategory, placementType 
   FROM cabinets WHERE category = 'Wall' AND subCategory IS NULL
   ORDER BY masterCode LIMIT 20`
);
console.log('\nWall cabinets with null subCategory:');
wallNull.forEach(r => console.log(`  ${r.masterCode}: ${r.description}`));

// Fix Wall cabinets with null subCategory - check if they are corner walls
// W361224, W361824, W362424 = corner wall cabinets
const cornerWalls = ['W361224', 'W361824', 'W362424'];
for (const code of cornerWalls) {
  await fixCabinet(code, 'Wall', 'Corner Wall', 'wall');
}

// U* = Utility/Pantry tall cabinets
const [utilityCabs] = await conn.execute(
  `SELECT masterCode, description FROM cabinets WHERE masterCode LIKE 'U%' AND (category IS NULL OR category = 'Accessory') LIMIT 10`
);
if (utilityCabs.length > 0) {
  console.log('\nUtility cabs needing fix:');
  utilityCabs.forEach(r => console.log(`  ${r.masterCode}: ${r.description}`));
}

// Check "Filler / Moulding" - these might be accessories
const [fillerCabs] = await conn.execute(
  `SELECT masterCode, description FROM cabinets WHERE category = 'Filler' LIMIT 10`
);
console.log('\nFiller cabinets:');
fillerCabs.forEach(r => console.log(`  ${r.masterCode}: ${r.description}`));

console.log(`\nTotal updated: ${updated}`);
await conn.end();
