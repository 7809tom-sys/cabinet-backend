// Apply catalog reclassification:
//  - Real cabinets stay in Base/Wall/Tall/Vanity/ADA
//  - Non-cabinets -> Accessory, split into sub-groups via subCategory:
//      "Trim & Molding", "Glass Door", "Accessory" (general)
//  - Keep existing Decorative End Panel / Skin Panel subCategory values as-is (they are Accessory already)
import mysql from 'mysql2/promise';

const url = process.env.DATABASE_URL;
if (!url) { console.error('No DATABASE_URL'); process.exit(1); }
const conn = await mysql.createConnection(url);

// id -> { category, subCategory } overrides
const overrides = {};

// 1) Base items that are NOT real cabinets -> Accessory
// OE-6 oven fillers (filler strips) -> Trim & Molding
[161, 162, 163].forEach(id => overrides[id] = { category: 'Accessory', subCategory: 'Trim & Molding' });
// Rollout trays RS-18..RS-36 (inserts, not cabinets) -> general Accessory
[203, 204, 205, 206, 207, 208, 209].forEach(id => overrides[id] = { category: 'Accessory', subCategory: 'Roll-Out Tray' });

// 2) Normalize existing Accessory sub-groups into the three buckets.
// Trim & Molding ids:
const trimMolding = [
  15,  // ACM-8 Crown Molding
  45,  // ALRM-8 Light Rail Molding
  70,  // BAM Base Angle Molding
  77,  // BCM-8 Base Crown Molding
  98,  // CBT Corner Base Trim
  100, 101, 102, // CM-2/4/8 Crown Molding
  103, // COV Cove Molding
  130, // FBM Flat Base Molding
  146, 147, // LRM / LRM-8 Light Rail Molding
  160, // OCM-8 Outside Corner Molding
  167, // RCM-4S Rope Crown Molding
  202, // RS-15 Rope Scribe Molding
  183, // SHM Shoe Molding
  184, // SM-8 Scribe Molding
  190, // TK-8 Toe Kick
  230, // VA-48 Arched Valance
  // Fillers
  378, // BF-3 Base Filler
  379, // BFF-3 Fluted Base Filler
  125, // F-1.5
  126, 127, 128, 129, // F-3-42, F-3-96, F-6-42, F-6-96
  140, 141, // FS-24, FS-30 Filler Strip
];
trimMolding.forEach(id => overrides[id] = { category: 'Accessory', subCategory: 'Trim & Molding' });

// 3) Everything else currently Accessory becomes general "Accessory",
//    EXCEPT the panels which keep their descriptive subCategory.
//    We'll handle that in SQL below (set subCategory='Accessory' where it is
//    Accessory category, not in trimMolding, and not a panel/end-panel/skin/roll-out).

await conn.beginTransaction();
try {
  for (const [id, o] of Object.entries(overrides)) {
    await conn.query(
      'UPDATE cabinets SET category=?, subCategory=? WHERE id=?',
      [o.category, o.subCategory, Number(id)]
    );
  }
  await conn.commit();
  console.log(`Applied ${Object.keys(overrides).length} explicit overrides.`);
} catch (e) {
  await conn.rollback();
  console.error('Rolled back:', e.message);
  process.exit(1);
}

// Verify
const [tally] = await conn.query(
  `SELECT category, subCategory, COUNT(*) c FROM cabinets WHERE category='Accessory' GROUP BY category, subCategory ORDER BY subCategory`
);
console.log('Accessory sub-groups now:');
for (const r of tally) console.log(`  ${r.subCategory}: ${r.c}`);
await conn.end();
