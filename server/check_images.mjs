import 'dotenv/config';
import mysql from 'mysql2/promise';
const c = await mysql.createConnection(process.env.DATABASE_URL);

// Check how many cabinets have catalogImageUrl vs NULL
const [[{ total, withImage, noImage }]] = await c.query(`
  SELECT 
    COUNT(*) as total,
    SUM(catalogImageUrl IS NOT NULL AND catalogImageUrl != '') as withImage,
    SUM(catalogImageUrl IS NULL OR catalogImageUrl = '') as noImage
  FROM cabinets WHERE isActive=1
`);
console.log(`Total active: ${total}, with image: ${withImage}, no image: ${noImage}`);

// Sample of cabinets without images
const [noImgRows] = await c.query(`
  SELECT masterCode, description, category, subCategory
  FROM cabinets 
  WHERE isActive=1 AND (catalogImageUrl IS NULL OR catalogImageUrl='')
  ORDER BY masterCode
  LIMIT 30
`);
console.log('\nCabinets WITHOUT catalogImageUrl:');
for (const r of noImgRows) console.log(`  ${r.masterCode} | ${r.category} | ${r.subCategory} | ${r.description?.substring(0,50)}`);

// Sample of cabinets with images
const [imgRows] = await c.query(`
  SELECT masterCode, description, catalogImageUrl
  FROM cabinets 
  WHERE isActive=1 AND catalogImageUrl IS NOT NULL AND catalogImageUrl != ''
  ORDER BY masterCode
  LIMIT 10
`);
console.log('\nCabinets WITH catalogImageUrl (sample):');
for (const r of imgRows) console.log(`  ${r.masterCode} | ${r.catalogImageUrl?.substring(0,60)}`);

await c.end();
