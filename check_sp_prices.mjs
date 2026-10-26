import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');
const url = process.env.DATABASE_URL || '';
const m = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);
const conn = await mysql.createConnection({ host: m[3], port: +m[4], user: m[1], password: m[2], database: m[5], ssl: { rejectUnauthorized: false } });

// Get Lumina White (ASP) style ID
const [[asp]] = await conn.execute("SELECT id FROM door_styles WHERE styleCode = 'ASP' LIMIT 1");
console.log('ASP style ID:', asp.id);

// Look up the top wall cabinets (W243024, W303024, W363024) and bottom (UCB2454, UCB3054, UCB3654)
const items = ['W243024','W303024','W363024','UCB2454','UCB3054','UCB3654'];
for (const code of items) {
  const [rows] = await conn.execute(`
    SELECT c.id, c.masterCode, c.description, c.width, c.height, c.depth, c.category, c.subCategory,
           ds.listPrice, ds.wholesalePrice, ds.contractorPrice, ds.homeownerPrice, ds.adjustedListPrice
    FROM cabinets c
    LEFT JOIN distributor_skus ds ON ds.cabinetId = c.id AND ds.styleId = ?
    WHERE c.masterCode = ?
    LIMIT 1
  `, [asp.id, code]);
  if (rows.length === 0) {
    console.log(`\n${code}: NOT FOUND in cabinets table`);
  } else {
    const r = rows[0];
    console.log(`\n${code}: id=${r.id}, ${r.width}"x${r.height}"x${r.depth}", cat=${r.category}/${r.subCategory}`);
    console.log(`  Prices: list=${r.listPrice}, wholesale=${r.wholesalePrice}, contractor=${r.contractorPrice}, homeowner=${r.homeownerPrice}`);
  }
}

await conn.end();
