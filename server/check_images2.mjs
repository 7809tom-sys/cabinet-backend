import 'dotenv/config';
import mysql from 'mysql2/promise';
const c = await mysql.createConnection(process.env.DATABASE_URL);

// Get ALL cabinets without images - full list
const [noImgRows] = await c.query(`
  SELECT masterCode, description, category, subCategory
  FROM cabinets 
  WHERE isActive=1 AND (catalogImageUrl IS NULL OR catalogImageUrl='')
  ORDER BY masterCode
`);
console.log(`\n=== ${noImgRows.length} cabinets WITHOUT images ===`);
for (const r of noImgRows) {
  console.log(`${r.masterCode}|${r.category}|${r.description?.substring(0,60)}`);
}

// Get all images that DO exist so we can find matches
const [imgRows] = await c.query(`
  SELECT masterCode, catalogImageUrl
  FROM cabinets 
  WHERE isActive=1 AND catalogImageUrl IS NOT NULL AND catalogImageUrl != ''
  ORDER BY masterCode
`);
console.log(`\n=== ${imgRows.length} cabinets WITH images ===`);
for (const r of imgRows) {
  console.log(`${r.masterCode}|${r.catalogImageUrl}`);
}

await c.end();
