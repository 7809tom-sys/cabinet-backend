import mysql from "mysql2/promise";
const conn = await mysql.createConnection(process.env.DATABASE_URL);
async function q(label, sql, params = []) {
  const [rows] = await conn.execute(sql, params);
  console.log("\n=== " + label + " ===");
  for (const r of rows) console.log(JSON.stringify(r));
}

// styleIds that a single-door base (B-12) is published for
await q("styles for B-12 (single door base)", `
  SELECT DISTINCT s.styleId, ds.ourName
  FROM distributor_skus s
  JOIN cabinets c ON c.id = s.cabinetId
  LEFT JOIN door_styles ds ON ds.id = s.styleId
  WHERE c.masterCode = 'B-12' AND s.isPublished=1 AND s.isAvailable=1
  ORDER BY s.styleId LIMIT 50
`);

// styleIds that a drawer base (DB-24-3) is published for
await q("styles for DB-24-3 (drawer base)", `
  SELECT DISTINCT s.styleId, ds.ourName
  FROM distributor_skus s
  JOIN cabinets c ON c.id = s.cabinetId
  LEFT JOIN door_styles ds ON ds.id = s.styleId
  WHERE c.masterCode = 'DB-24-3' AND s.isPublished=1 AND s.isAvailable=1
  ORDER BY s.styleId LIMIT 50
`);

// For each style, count base cabinets vs drawer bases published
await q("per-style: base count vs drawer-base count", `
  SELECT s.styleId, ds.ourName,
         SUM(c.subCategory='Drawer Base') drawer_bases,
         SUM(c.placementType='base') all_bases
  FROM distributor_skus s
  JOIN cabinets c ON c.id = s.cabinetId
  LEFT JOIN door_styles ds ON ds.id = s.styleId
  WHERE s.isPublished=1 AND s.isAvailable=1
  GROUP BY s.styleId, ds.ourName
  ORDER BY drawer_bases ASC
  LIMIT 60
`);
await conn.end();
