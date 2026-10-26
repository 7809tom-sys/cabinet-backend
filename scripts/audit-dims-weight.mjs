import { createConnection } from "mysql2/promise";
const url = process.env.DATABASE_URL;
const conn = await createConnection(url);

// 1. What dimension/weight columns exist on the cabinets table?
const [cols] = await conn.execute(`
  SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cabinets'
    AND COLUMN_NAME REGEXP 'weight|width|height|depth|dim|pkg|package|box|ship|assembled'
  ORDER BY ORDINAL_POSITION
`);
console.log("Dimension/weight columns on cabinets:", JSON.stringify(cols, null, 2));

// 2. How many cabinets have NULL weight?
const [nullWeight] = await conn.execute(`
  SELECT
    COUNT(*) AS total,
    SUM(CASE WHEN weight IS NULL OR weight = 0 THEN 1 ELSE 0 END) AS missingWeight
  FROM cabinets
`);
console.log("\nWeight audit:", JSON.stringify(nullWeight, null, 2));

// 3. Sample rows showing assembled vs package dims
const [sample] = await conn.execute(`
  SELECT masterCode, description,
         width, height, depth,
         pkgWidth, pkgHeight, pkgDepth, pkgWeight,
         weight
  FROM cabinets
  LIMIT 10
`);
console.log("\nSample rows:", JSON.stringify(sample, null, 2));

await conn.end();
