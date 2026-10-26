import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';

const configPath = '/home/ubuntu/cabinet-dealz/.project-config.json';
const config = JSON.parse(readFileSync(configPath, 'utf-8'));
const conn = await mysql.createConnection(config.env_vars.DATABASE_URL);

const [rows] = await conn.execute(`
  SELECT c.id, c.masterCode, c.description, c.width, c.height, c.depth,
         (SELECT COUNT(*) FROM distributor_skus ds WHERE ds.cabinetId = c.id) as skuCount
  FROM cabinets c
  WHERE c.isActive = 1
  AND c.depth = 24
  AND c.category = 'Wall'
  ORDER BY c.width, c.height, c.id
`);

console.log("\\nAll 24\" deep Wall Cabinets (Refrigerator Walls):");
console.log("=".repeat(120));
console.log("ID       | Code          | Width | Height | SKUs | Description");
console.log("-".repeat(120));
for (const r of rows) {
  console.log(`${r.id} | ${r.masterCode.padEnd(13)} | ${String(r.width).padEnd(5)} | ${String(r.height).padEnd(6)} | ${String(r.skuCount).padEnd(4)} | ${(r.description || '').substring(0, 60)}`);
}
console.log(`\\nTotal: ${rows.length} items`);

await conn.end();
