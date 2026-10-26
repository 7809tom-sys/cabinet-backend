import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) { console.error("no DATABASE_URL"); process.exit(1); }
const conn = await mysql.createConnection(url);

async function q(label, sql, params = []) {
  const [rows] = await conn.execute(sql, params);
  console.log("\n=== " + label + " ===");
  for (const r of rows) console.log(JSON.stringify(r));
}

await q("drawer base cabinets", `
  SELECT masterCode, category, subCategory, placementType, isActive,
         numberOfDrawers, numberOfDoors, width, height
  FROM cabinets
  WHERE (masterCode LIKE 'DB%' OR LOWER(description) LIKE '%drawer base%')
  ORDER BY masterCode
  LIMIT 60
`);

await q("drawer base placementType breakdown", `
  SELECT COALESCE(placementType,'(null)') pt, COUNT(*) n
  FROM cabinets
  WHERE masterCode LIKE 'DB%' OR LOWER(description) LIKE '%drawer base%'
  GROUP BY pt
`);

await q("drawer base SKU availability", `
  SELECT c.masterCode,
         SUM(s.isPublished=1 AND s.isAvailable=1) published_avail,
         COUNT(s.id) total_skus
  FROM cabinets c
  LEFT JOIN distributor_skus s ON s.cabinetId = c.id
  WHERE c.masterCode LIKE 'DB%'
  GROUP BY c.masterCode
  ORDER BY c.masterCode
  LIMIT 40
`);

await q("Skyline style", `
  SELECT id, ourName, doorStyle, distributorId FROM door_styles
  WHERE LOWER(ourName) LIKE '%skyline%' OR LOWER(doorStyle) LIKE '%skyline%'
  LIMIT 10
`);

await conn.end();
