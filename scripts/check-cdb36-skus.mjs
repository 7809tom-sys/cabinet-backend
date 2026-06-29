import { createConnection } from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) { console.error("No DATABASE_URL"); process.exit(1); }

const conn = await createConnection(url);

// Check all variants of CDB36 in cabinets table
const [cabs] = await conn.execute(`
  SELECT c.id, c.masterCode, c.description, c.category, c.subCategory,
         c.placementType, c.isCornerCabinet, c.isActive, c.showInDesigner,
         COUNT(ds.id) AS totalSkus,
         SUM(CASE WHEN ds.isAvailable=1 AND ds.isPublished=1 THEN 1 ELSE 0 END) AS availableSkus
  FROM cabinets c
  LEFT JOIN distributor_skus ds ON ds.cabinetId = c.id
  WHERE c.masterCode LIKE 'CDB%'
  GROUP BY c.id
`);

console.log("All CDB* cabinets:");
console.log(JSON.stringify(cabs, null, 2));

// Also check distributor SKUs for all CDB* cabinets
const [skus] = await conn.execute(`
  SELECT ds.id, ds.cabinetId, ds.distributorId, ds.styleId, ds.distributorSku,
         ds.isAvailable, ds.isPublished,
         d.name AS distName, d.brandName, d.code AS distCode,
         dstyle.ourName AS styleName, dstyle.styleCode,
         c.masterCode
  FROM distributor_skus ds
  JOIN cabinets c ON c.id = ds.cabinetId
  JOIN distributors d ON d.id = ds.distributorId
  LEFT JOIN door_styles dstyle ON dstyle.id = ds.styleId
  WHERE c.masterCode LIKE 'CDB%'
  ORDER BY c.masterCode, ds.distributorId, ds.styleId
  LIMIT 30
`);

console.log("\nAll CDB* SKUs:");
console.log(JSON.stringify(skus, null, 2));

await conn.end();
