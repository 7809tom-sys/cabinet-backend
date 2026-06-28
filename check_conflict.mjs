import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');
const url = process.env.DATABASE_URL || '';
const m = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);
const conn = await mysql.createConnection({ host: m[3], port: +m[4], user: m[1], password: m[2], database: m[5], ssl: { rejectUnauthorized: false } });

// Check tall cabinets for Oxford Blanc (30053) - are any in conflict?
const [rows] = await conn.execute(`
  SELECT c.masterCode, c.category, c.subCategory, c.conflictStatus, cs.isPublished, cs.isAvailable
  FROM distributor_skus cs 
  JOIN cabinets c ON c.id = cs.cabinetId 
  WHERE cs.styleId = 30053 AND c.category = 'Tall'
  LIMIT 20
`);
console.log('Oxford Blanc Tall cabinets:');
rows.forEach(r => console.log(JSON.stringify(r)));
await conn.end();
