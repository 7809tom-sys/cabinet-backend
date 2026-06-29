import { createConnection } from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) { console.error("No DATABASE_URL"); process.exit(1); }

const conn = await createConnection(url);

const [rows] = await conn.execute(`
  SELECT c.id, c.masterCode, c.description, c.category, c.subCategory,
         c.placementType, c.isCornerCabinet, c.isActive, c.showInDesigner,
         COUNT(ds.id) AS totalSkus,
         SUM(CASE WHEN ds.isAvailable=1 AND ds.isPublished=1 THEN 1 ELSE 0 END) AS availableSkus
  FROM cabinets c
  LEFT JOIN distributor_skus ds ON ds.cabinetId = c.id
  WHERE LOWER(c.description) LIKE '%corner%drawer%'
     OR LOWER(c.description) LIKE '%drawer%corner%'
     OR LOWER(c.masterCode) LIKE '%cdb%'
  GROUP BY c.id
`);

console.log(JSON.stringify(rows, null, 2));
await conn.end();
