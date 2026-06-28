import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

const url = process.env.DATABASE_URL || '';
const match = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);
if (!match) { console.log('No DB URL'); process.exit(1); }
const [,user,password,host,port,database] = match;
const conn = await mysql.createConnection({ host, port: +port, user, password, database, ssl: { rejectUnauthorized: false } });

// Find Clark and Son / Casselberry / Oxford styles
const [styles] = await conn.execute(
  "SELECT id, ourName, styleCode FROM door_styles WHERE ourName LIKE '%Clark%' OR ourName LIKE '%Casselberry%' OR ourName LIKE '%Oxford%' ORDER BY ourName"
);
console.log('Clark-related styles:');
styles.forEach(s => console.log(' -', s.id, s.ourName, s.styleCode));

// For each style, count tall cabinets
for (const s of styles) {
  const [rows] = await conn.execute(
    `SELECT c.category, c.subCategory, COUNT(*) as cnt 
     FROM distributor_skus cs 
     JOIN cabinets c ON c.id = cs.cabinetId 
     WHERE cs.styleId = ? AND cs.isPublished = 1 AND cs.isAvailable = 1
     GROUP BY c.category, c.subCategory
     ORDER BY c.category`,
    [s.id]
  );
  const tall = rows.filter(r => r.category === 'Tall');
  console.log(`\n${s.ourName} (${s.styleCode}) - Tall count: ${tall.length}`);
  if (tall.length === 0) {
    const cats = [...new Set(rows.map(r => r.category))];
    console.log('  Available categories:', cats.join(', '));
  } else {
    tall.forEach(r => console.log('  ', r.category, '/', r.subCategory, '-', r.cnt));
  }
}

await conn.end();
