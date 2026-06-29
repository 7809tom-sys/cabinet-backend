import { createConnection } from "mysql2/promise";
const url = process.env.DATABASE_URL;
const conn = await createConnection(url);

// 1. Check CDB-36 conflict status
const [cab] = await conn.execute(`
  SELECT id, masterCode, description, isActive, showInDesigner, conflictStatus, conflictReason
  FROM cabinets WHERE masterCode = 'CDB-36'
`);
console.log("Cabinet row:", JSON.stringify(cab, null, 2));

// 2. Run the EXACT placeableCabinets WHERE clause (isActive=1, conflictStatus != 'conflict', showInDesigner=1)
const [designerRows] = await conn.execute(`
  SELECT c.id, c.masterCode, c.description, c.isActive, c.showInDesigner, c.conflictStatus
  FROM cabinets c
  WHERE c.isActive = 1
    AND c.conflictStatus != 'conflict'
    AND c.showInDesigner = 1
    AND c.masterCode = 'CDB-36'
`);
console.log("\nPasses placeableCabinets WHERE filter:", JSON.stringify(designerRows, null, 2));

// 3. Check availability gate: does it have isAvailable=1 AND isPublished=1 SKUs?
const [availSkus] = await conn.execute(`
  SELECT ds.cabinetId, COUNT(*) AS cnt
  FROM distributor_skus ds
  WHERE ds.cabinetId = (SELECT id FROM cabinets WHERE masterCode='CDB-36')
    AND ds.isAvailable = 1
    AND ds.isPublished = 1
  GROUP BY ds.cabinetId
`);
console.log("\nAvailable+Published SKU count:", JSON.stringify(availSkus, null, 2));

// 4. Check with a specific Clark & Son styleId (styleId=30001 = Lumina White)
const [styleSkus] = await conn.execute(`
  SELECT ds.cabinetId, ds.styleId, ds.distributorId, ds.isAvailable, ds.isPublished
  FROM distributor_skus ds
  WHERE ds.cabinetId = (SELECT id FROM cabinets WHERE masterCode='CDB-36')
    AND ds.isAvailable = 1
    AND ds.isPublished = 1
    AND ds.styleId = 30001
`);
console.log("\nSKUs for styleId=30001 (Lumina White):", JSON.stringify(styleSkus, null, 2));

await conn.end();
