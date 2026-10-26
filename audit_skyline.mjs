// Audit Skyline for missing cabinet SKUs
// Checks which standard cabinet codes are missing from Skyline's distributor SKUs

import { createConnection } from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const db = await createConnection(process.env.DATABASE_URL);

// Get Skyline distributor ID
const [dists] = await db.execute("SELECT id, name FROM distributors WHERE name LIKE '%Skyline%' LIMIT 5");
console.log("Skyline distributors:", dists);

if (!dists.length) {
  console.log("No Skyline distributor found.");
  await db.end();
  process.exit(0);
}

const skylineId = dists[0].id;
console.log(`\nUsing distributor ID: ${skylineId} (${dists[0].name})`);

// Get all Skyline SKUs
const [skus] = await db.execute(
  `SELECT ds.distributor_sku, ds.style_id, c.master_code, c.category, c.sub_category
   FROM distributor_skus ds
   JOIN cabinets c ON ds.cabinet_id = c.id
   WHERE ds.distributor_id = ?
   ORDER BY c.master_code`,
  [skylineId]
);

console.log(`\nTotal Skyline SKUs: ${skus.length}`);

// Get all active cabinets
const [allCabinets] = await db.execute(
  `SELECT id, master_code, category, sub_category FROM cabinets WHERE is_active = 1 ORDER BY master_code`
);

// Find cabinets that have NO Skyline SKU
const skylineMasterCodes = new Set(skus.map(s => s.master_code));
const missing = allCabinets.filter(c => !skylineMasterCodes.has(c.master_code));

console.log(`\nCabinets with NO Skyline SKU: ${missing.length}`);

// Group by category
const byCategory = {};
for (const c of missing) {
  const cat = c.category || "Unknown";
  if (!byCategory[cat]) byCategory[cat] = [];
  byCategory[cat].push(c.master_code);
}

for (const [cat, codes] of Object.entries(byCategory)) {
  console.log(`\n${cat} (${codes.length} missing):`);
  console.log(codes.slice(0, 20).join(", ") + (codes.length > 20 ? ` ... +${codes.length - 20} more` : ""));
}

await db.end();
