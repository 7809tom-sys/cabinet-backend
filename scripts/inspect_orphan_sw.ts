import { getDb } from "../server/db";
import { sql } from "drizzle-orm";

const db = await getDb();
if (!db) { console.error("No DB"); process.exit(1); }

// First 30 SKUs in the orphan style 300001
const [skus] = await db.execute(sql`
  SELECT platformSku, distributorSku, distributorId, listPrice, status, supplierCabinetName
  FROM distributor_skus WHERE styleId = 300001
  ORDER BY platformSku LIMIT 30
`);
console.log("=== First 30 SKUs in orphan style 300001 ===");
for (const r of skus as any[]) {
  console.log(`  platform="${r.platformSku}" | distSku="${r.distributorSku}" | distId=${r.distributorId} | name="${r.supplierCabinetName}"`);
}

// Distinct distributorIds
const [distIds] = await db.execute(sql`
  SELECT distributorId, COUNT(*) as cnt FROM distributor_skus WHERE styleId = 300001 GROUP BY distributorId
`);
console.log("\n=== Distinct distributorIds in style 300001 ===");
for (const r of distIds as any[]) {
  console.log(`  distId=${r.distributorId} | count=${r.cnt}`);
}

// Distributor info for those IDs
const [distInfo] = await db.execute(sql`
  SELECT DISTINCT d.id, d.name, d.code
  FROM distributor_skus dsk
  JOIN distributors d ON d.id = dsk.distributorId
  WHERE dsk.styleId = 300001
`);
console.log("\n=== Distributor(s) the SKUs belong to ===");
for (const r of distInfo as any[]) {
  console.log(`  id=${r.id} | name="${r.name}" | code="${r.code}"`);
}

// Check for ADA or specialty cabinets
const [adaRows] = await db.execute(sql`
  SELECT platformSku, distributorSku, supplierCabinetName FROM distributor_skus
  WHERE styleId = 300001 AND (platformSku LIKE '%ADA%' OR distributorSku LIKE '%ADA%' OR supplierCabinetName LIKE '%ADA%')
  LIMIT 10
`);
console.log("\n=== ADA SKUs in style 300001 ===");
for (const r of adaRows as any[]) {
  console.log(`  platform="${r.platformSku}" | distSku="${r.distributorSku}" | name="${r.supplierCabinetName}"`);
}

// Check for roll-out / specialty
const [specRows] = await db.execute(sql`
  SELECT platformSku, distributorSku, supplierCabinetName FROM distributor_skus
  WHERE styleId = 300001 AND (platformSku LIKE '%ROT%' OR platformSku LIKE '%ROLL%' OR supplierCabinetName LIKE '%Roll%' OR supplierCabinetName LIKE '%Tray%')
  LIMIT 10
`);
console.log("\n=== Roll-out/Tray SKUs in style 300001 ===");
for (const r of specRows as any[]) {
  console.log(`  platform="${r.platformSku}" | distSku="${r.distributorSku}" | name="${r.supplierCabinetName}"`);
}

// Also check the USCD style 330014 SKU count and a few samples
const [ucdSkus] = await db.execute(sql`
  SELECT platformSku, distributorSku, supplierCabinetName FROM distributor_skus
  WHERE styleId = 330014
  ORDER BY platformSku LIMIT 10
`);
console.log("\n=== First 10 SKUs in USCD style 330014 ===");
for (const r of ucdSkus as any[]) {
  console.log(`  platform="${r.platformSku}" | distSku="${r.distributorSku}" | name="${r.supplierCabinetName}"`);
}

process.exit(0);
