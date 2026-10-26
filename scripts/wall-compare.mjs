import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';

const configPath = '/home/ubuntu/cabinet-dealz/.project-config.json';
const config = JSON.parse(readFileSync(configPath, 'utf-8'));
const conn = await mysql.createConnection(config.env_vars.DATABASE_URL);

// Get Skyline non-GD wall cabinets
const [skyline] = await conn.execute(`
  SELECT id, masterCode, description, width, height, depth, numberOfDoors,
         (SELECT COUNT(*) FROM distributor_skus ds WHERE ds.cabinetId = c.id) as skuCount
  FROM cabinets c
  WHERE c.isActive = 1 AND c.id BETWEEN 9360000 AND 9369999
  AND c.category = 'Wall' AND c.masterCode NOT LIKE '%GD%'
  AND c.width IS NOT NULL
  ORDER BY c.width, c.height
`);

// Get Ashford wall cabinets
const [ashford] = await conn.execute(`
  SELECT id, masterCode, description, width, height, depth, numberOfDoors,
         (SELECT COUNT(*) FROM distributor_skus ds WHERE ds.cabinetId = c.id) as skuCount
  FROM cabinets c
  WHERE c.isActive = 1 AND c.id BETWEEN 9390000 AND 9399999
  AND c.category = 'Wall'
  AND c.width IS NOT NULL
  ORDER BY c.width, c.height
`);

console.log("SKYLINE NON-GD WALL CABINETS:");
console.log("ID       | Code         | W    | H    | D    | Doors | SKUs | Description");
console.log("-".repeat(110));
for (const r of skyline) {
  console.log(`${r.id} | ${(r.masterCode||'').padEnd(12)} | ${String(r.width).padEnd(4)} | ${String(r.height).padEnd(4)} | ${String(r.depth||'12').padEnd(4)} | ${String(r.numberOfDoors).padEnd(5)} | ${String(r.skuCount).padEnd(4)} | ${(r.description||'').substring(0,50)}`);
}

console.log("\n\nASHFORD WALL CABINETS:");
console.log("ID       | Code         | W    | H    | D    | Doors | SKUs | Description");
console.log("-".repeat(110));
for (const r of ashford) {
  console.log(`${r.id} | ${(r.masterCode||'').padEnd(12)} | ${String(r.width).padEnd(4)} | ${String(r.height).padEnd(4)} | ${String(r.depth||'12').padEnd(4)} | ${String(r.numberOfDoors).padEnd(5)} | ${String(r.skuCount).padEnd(4)} | ${(r.description||'').substring(0,50)}`);
}

await conn.end();
