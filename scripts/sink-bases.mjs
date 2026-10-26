import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';

const configPath = '/home/ubuntu/cabinet-dealz/.project-config.json';
const config = JSON.parse(readFileSync(configPath, 'utf-8'));
const conn = await mysql.createConnection(config.env_vars.DATABASE_URL);

const [rows] = await conn.execute(`
  SELECT id, masterCode, description, width,
         (SELECT COUNT(*) FROM distributor_skus ds WHERE ds.cabinetId = c.id) as skuCount
  FROM cabinets c
  WHERE c.isActive = 1 AND c.category = 'Base'
  AND (c.masterCode LIKE 'SB%' OR c.description LIKE '%Sink Base%' OR c.description LIKE '%sink base%')
  AND c.masterCode != 'SB-15MINI'
  ORDER BY c.width, c.id
`);

console.log("SINK BASES:");
console.log("ID       | Code       | Width | SKUs | Description");
console.log("-".repeat(100));
for (const r of rows) {
  console.log(`${r.id} | ${(r.masterCode || '').padEnd(10)} | ${String(r.width).padEnd(5)} | ${String(r.skuCount).padEnd(4)} | ${(r.description || '').substring(0, 60)}`);
}

await conn.end();
