import 'dotenv/config';
import mysql from 'mysql2/promise';
const c = await mysql.createConnection(process.env.DATABASE_URL);

// Current wall subcategories
const [subs] = await c.query(`SELECT DISTINCT subCategory, COUNT(*) as n FROM cabinets WHERE category='Wall' AND isActive=1 GROUP BY subCategory ORDER BY subCategory`);
console.log('=== Current Wall subcategories ===');
for (const r of subs) console.log(`  "${r.subCategory}" (${r.n})`);

// Items that should be Specialty Wall
const [spec] = await c.query(`
  SELECT masterCode, description, subCategory 
  FROM cabinets 
  WHERE isActive=1 AND (
    LOWER(description) LIKE '%plate rack%'
    OR LOWER(description) LIKE '%wine rack%'
    OR LOWER(description) LIKE '%stem glass%'
    OR LOWER(description) LIKE '%appliance garage%'
    OR LOWER(description) LIKE '%microwave%'
    OR LOWER(description) LIKE '%range hood%'
    OR LOWER(masterCode) LIKE 'AG%'
    OR LOWER(masterCode) LIKE 'SGH%'
    OR LOWER(masterCode) LIKE 'WR%'
    OR LOWER(masterCode) LIKE 'PR%'
    OR LOWER(masterCode) LIKE 'MW%'
    OR LOWER(masterCode) LIKE 'RHC%'
    OR LOWER(masterCode) LIKE 'WCA%'
  )
  ORDER BY masterCode
`);
console.log('\n=== Specialty Wall candidates ===');
for (const r of spec) console.log(`  ${r.masterCode} | ${r.subCategory} | ${r.description?.substring(0,50)}`);

await c.end();
