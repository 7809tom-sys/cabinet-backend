import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');
const url = process.env.DATABASE_URL || '';
const m = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);
const conn = await mysql.createConnection({ host: m[3], port: +m[4], user: m[1], password: m[2], database: m[5], ssl: { rejectUnauthorized: false } });

const codes = ['UC1884','UC1890','UC1896','UC2484','UC2490','UC2496','UOC3384','UOC3390','UOC3396'];

// Get ASP style ID
const [[asp]] = await conn.execute("SELECT id FROM door_styles WHERE styleCode = 'ASP' LIMIT 1");
console.log('ASP style ID:', asp.id);

for (const code of codes) {
  const [rows] = await conn.execute(`
    SELECT c.id, c.masterCode, c.description, c.width, c.height, c.depth, c.category, c.subCategory, c.isActive,
           ds.id as skuId, ds.listPrice, ds.wholesalePrice, ds.isPublished, ds.isAvailable
    FROM cabinets c
    LEFT JOIN distributor_skus ds ON ds.cabinetId = c.id AND ds.styleId = ?
    WHERE c.masterCode = ?
    LIMIT 1
  `, [asp.id, code]);
  if (rows.length === 0) {
    console.log(`${code}: NOT IN cabinets table`);
  } else {
    const r = rows[0];
    console.log(`${code}: id=${r.id}, ${r.width}"x${r.height}"x${r.depth}", cat=${r.category}/${r.subCategory}, active=${r.isActive}`);
    if (r.skuId) {
      console.log(`  SKU: id=${r.skuId}, list=${r.listPrice}, wholesale=${r.wholesalePrice}, published=${r.isPublished}, available=${r.isAvailable}`);
    } else {
      console.log(`  NO SKU for ASP`);
    }
  }
}

await conn.end();
