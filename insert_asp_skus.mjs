import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

const url = process.env.DATABASE_URL || '';
const m = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);
if (!m) { console.error('No DATABASE_URL'); process.exit(1); }

const conn = await mysql.createConnection({
  host: m[3], port: +m[4], user: m[1], password: m[2],
  database: m[5].split('?')[0], ssl: { rejectUnauthorized: false }
});

const skus = [
  { id: 4920001, sku: 'UC1884-ASP', list: 1073.34 },
  { id: 4920002, sku: 'UC1890-ASP', list: 1127.07 },
  { id: 4920003, sku: 'UC1896-ASP', list: 1181.88 },
  { id: 4920004, sku: 'UC2484-ASP', list: 1251.52 },
  { id: 4920005, sku: 'UC2490-ASP', list: 1238.85 },
  { id: 4920006, sku: 'UC2496-ASP', list: 1273.57 },
  { id: 4920007, sku: 'UOC3384-ASP', list: 1575.87 },
  { id: 4920008, sku: 'UOC3390-ASP', list: 1693.97 },
  { id: 4920009, sku: 'UOC3396-ASP', list: 1726.71 },
];

for (const s of skus) {
  const w = Math.round(s.list * 0.55 * 100) / 100;
  const c = Math.round(s.list * 0.65 * 100) / 100;
  const h = Math.round(s.list * 0.85 * 100) / 100;
  try {
    await conn.execute(
      `INSERT INTO distributor_skus (cabinetId, styleId, distributorId, platformSku, distributorSku, listPrice, wholesalePrice, contractorPrice, homeownerPrice, adjustedListPrice, isPublished, isAvailable)
       VALUES (?, 30001, 2, ?, ?, ?, ?, ?, ?, ?, 1, 1)`,
      [s.id, s.sku, s.sku, s.list, w, c, h, s.list]
    );
    console.log(`✓ ${s.sku} list=$${s.list} wholesale=$${w}`);
  } catch (e) {
    console.error(`✗ ${s.sku}:`, e.message);
  }
}

await conn.end();
console.log('Done.');
