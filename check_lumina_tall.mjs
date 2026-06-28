import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');
const url = process.env.DATABASE_URL || '';
const m = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);
const conn = await mysql.createConnection({ host: m[3], port: +m[4], user: m[1], password: m[2], database: m[5], ssl: { rejectUnauthorized: false } });

// Get Lumina White style ID
const [styles] = await conn.execute("SELECT id, ourName, styleCode FROM door_styles WHERE ourName LIKE '%Lumina White%' OR styleCode = 'ASP'");
console.log('Lumina White styles:', styles);

for (const s of styles) {
  // Count tall cabinets for this style
  const [rows] = await conn.execute(`
    SELECT c.category, c.subCategory, COUNT(*) as cnt
    FROM distributor_skus cs
    JOIN cabinets c ON c.id = cs.cabinetId
    WHERE cs.styleId = ? AND cs.isPublished = 1 AND cs.isAvailable = 1 AND c.category = 'Tall'
    GROUP BY c.category, c.subCategory
  `, [s.id]);
  console.log(`\nLumina White (${s.id}) Tall cabinets:`, rows.length === 0 ? 'NONE' : rows);

  // Also check all categories available
  const [cats] = await conn.execute(`
    SELECT DISTINCT c.category, COUNT(*) as cnt
    FROM distributor_skus cs
    JOIN cabinets c ON c.id = cs.cabinetId
    WHERE cs.styleId = ? AND cs.isPublished = 1 AND cs.isAvailable = 1
    GROUP BY c.category
    ORDER BY c.category
  `, [s.id]);
  console.log('All categories for this style:');
  cats.forEach(r => console.log(' ', r.category, '-', r.cnt));
}

// Now check which styles DO have tall cabinets to compare
const [tallStyles] = await conn.execute(`
  SELECT ds.ourName, ds.styleCode, COUNT(DISTINCT c.id) as tallCount
  FROM door_styles ds
  JOIN distributor_skus cs ON cs.styleId = ds.id AND cs.isPublished = 1 AND cs.isAvailable = 1
  JOIN cabinets c ON c.id = cs.cabinetId AND c.category = 'Tall'
  GROUP BY ds.id, ds.ourName, ds.styleCode
  ORDER BY ds.ourName
  LIMIT 10
`);
console.log('\nStyles WITH tall cabinets (first 10):');
tallStyles.forEach(r => console.log(' ', r.ourName, r.styleCode, '-', r.tallCount));

await conn.end();
