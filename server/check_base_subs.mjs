import 'dotenv/config';
import mysql from 'mysql2/promise';
const c = await mysql.createConnection(process.env.DATABASE_URL);

// Current base subcategories
const [subs] = await c.query(`SELECT DISTINCT subCategory, COUNT(*) as n FROM cabinets WHERE category='Base' AND isActive=1 GROUP BY subCategory ORDER BY subCategory`);
console.log('=== Current Base subcategories ===');
for (const r of subs) console.log(`  "${r.subCategory}" (${r.n})`);

// Specialty base candidates
const [spec] = await c.query(`
  SELECT masterCode, description, subCategory 
  FROM cabinets 
  WHERE isActive=1 AND category IN ('Base','Accessory') AND (
    LOWER(description) LIKE '%trash%'
    OR LOWER(description) LIKE '%waste%'
    OR LOWER(description) LIKE '%spice%'
    OR LOWER(description) LIKE '%pull.out%'
    OR LOWER(description) LIKE '%pullout%'
    OR LOWER(description) LIKE '%recycl%'
    OR LOWER(description) LIKE '%microwave%'
    OR LOWER(description) LIKE '%tray%'
    OR LOWER(description) LIKE '%lazy susan%'
    OR LOWER(description) LIKE '%cutlery%'
    OR LOWER(masterCode) LIKE 'MB%'
    OR LOWER(masterCode) LIKE 'BMC%'
    OR LOWER(masterCode) LIKE 'BMW%'
    OR LOWER(masterCode) LIKE 'BT%'
    OR LOWER(masterCode) LIKE 'BSR%'
    OR LOWER(masterCode) LIKE 'BSDC%'
  )
  ORDER BY masterCode
`);
console.log('\n=== Specialty Base candidates ===');
for (const r of spec) console.log(`  ${r.masterCode} | ${r.subCategory} | ${r.description?.substring(0,55)}`);

await c.end();
