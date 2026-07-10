import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';

// Load env manually
const envFile = readFileSync('/home/ubuntu/cabinet-dealz/.env', 'utf8');
const env = {};
for (const line of envFile.split('\n')) {
  const m = line.match(/^([^=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
}

const conn = await mysql.createConnection(env.DATABASE_URL);

const [styles] = await conn.query(`
  SELECT ds.id, ds.name, ds.slug, ds.distributorId,
    COUNT(DISTINCT c.id) as cabinet_count
  FROM door_styles ds
  LEFT JOIN cabinets c ON c.doorStyleId = ds.id
  WHERE ds.distributorId = 1
  GROUP BY ds.id
  ORDER BY ds.name
`);

console.log('Door styles (USCD):');
for (const s of styles) {
  console.log(`  id=${s.id} | ${s.name} | slug=${s.slug} | cabinets=${s.cabinet_count}`);
}

await conn.end();
