import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');
const url = process.env.DATABASE_URL || '';
const m = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);
const conn = await mysql.createConnection({ host: m[3], port: +m[4], user: m[1], password: m[2], database: m[5], ssl: { rejectUnauthorized: false } });

// Get Lumina White style ID
const [[lw]] = await conn.execute("SELECT id, ourName FROM door_styles WHERE styleCode = 'ASP' LIMIT 1");
console.log('Lumina White id:', lw.id);

// Check all Tall category SKUs for Lumina White
const [rows] = await conn.execute(`
  SELECT c.masterCode, c.category, c.subCategory, c.conflictStatus, cs.isPublished, cs.isAvailable
  FROM distributor_skus cs
  JOIN cabinets c ON c.id = cs.cabinetId
  WHERE cs.styleId = ? AND c.category = 'Tall'
  LIMIT 30
`, [lw.id]);
console.log('Tall SKUs for Lumina White:', rows.length);
rows.forEach(r => console.log(JSON.stringify(r)));

// Check Split Pantry cabinets exist at all
const [sp] = await conn.execute("SELECT id, masterCode, category, subCategory, isActive FROM cabinets WHERE subCategory = 'Split Pantry' LIMIT 10");
console.log('\nSplit Pantry cabinets in DB:', sp.length);
sp.forEach(r => console.log(JSON.stringify(r)));

await conn.end();
