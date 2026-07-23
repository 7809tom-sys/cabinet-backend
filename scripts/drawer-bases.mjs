import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';

const configPath = '/home/ubuntu/cabinet-dealz/.project-config.json';
const config = JSON.parse(readFileSync(configPath, 'utf-8'));
const conn = await mysql.createConnection(config.env_vars.DATABASE_URL);

// Get Skyline drawer bases
const [skyline] = await conn.execute(`
  SELECT id, masterCode, description, width, numberOfDrawers,
         (SELECT COUNT(*) FROM distributor_skus ds WHERE ds.cabinetId = c.id) as skuCount
  FROM cabinets c
  WHERE c.isActive = 1 AND c.id BETWEEN 9360000 AND 9369999
  AND (c.masterCode LIKE '%DB%' OR c.masterCode LIKE '2DB%' OR c.masterCode LIKE '3DB%')
  ORDER BY c.width, c.masterCode
`);

// Get Ashford drawer bases
const [ashford] = await conn.execute(`
  SELECT id, masterCode, description, width, numberOfDrawers,
         (SELECT COUNT(*) FROM distributor_skus ds WHERE ds.cabinetId = c.id) as skuCount
  FROM cabinets c
  WHERE c.isActive = 1 AND c.id BETWEEN 9390000 AND 9399999
  AND (c.masterCode LIKE 'DB-%' OR c.description LIKE '%Drawer Base%')
  ORDER BY c.width, c.masterCode
`);

console.log("SKYLINE DRAWER BASES:");
console.log("ID       | Code    | Width | Drawers | SKUs | Description");
console.log("-".repeat(90));
for (const r of skyline) {
  console.log(`${r.id} | ${(r.masterCode || '').padEnd(7)} | ${String(r.width || '?').padEnd(5)} | ${String(r.numberOfDrawers).padEnd(7)} | ${String(r.skuCount).padEnd(4)} | ${(r.description || '').substring(0, 50)}`);
}

console.log("\nASHFORD DRAWER BASES:");
console.log("ID       | Code      | Width | Drawers | SKUs | Description");
console.log("-".repeat(90));
for (const r of ashford) {
  console.log(`${r.id} | ${(r.masterCode || '').padEnd(9)} | ${String(r.width || '?').padEnd(5)} | ${String(r.numberOfDrawers).padEnd(7)} | ${String(r.skuCount).padEnd(4)} | ${(r.description || '').substring(0, 50)}`);
}

await conn.end();
