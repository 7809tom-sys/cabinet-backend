import 'dotenv/config';
import mysql from 'mysql2/promise';
const c = await mysql.createConnection(process.env.DATABASE_URL);

// Check existing pkg dims for base cabinets that DO have data
const [baseSample] = await c.query(`
  SELECT masterCode, width, height, depth, weight, pkgLength, pkgWidth, pkgHeight, pkgWeight, category
  FROM cabinets 
  WHERE isActive=1 AND category='Base' AND pkgLength > 0
  ORDER BY width
  LIMIT 20
`);
console.log('=== Base cabinets WITH pkg dims ===');
for (const r of baseSample) {
  console.log(`  ${r.masterCode} | cab:${r.width}x${r.height}x${r.depth} wt:${r.weight} | pkg:${r.pkgLength}x${r.pkgWidth}x${r.pkgHeight} pkgWt:${r.pkgWeight}`);
}

// Check wall cabinets
const [wallSample] = await c.query(`
  SELECT masterCode, width, height, depth, weight, pkgLength, pkgWidth, pkgHeight, pkgWeight
  FROM cabinets 
  WHERE isActive=1 AND category='Wall' AND pkgLength > 0
  ORDER BY width, height
  LIMIT 15
`);
console.log('\n=== Wall cabinets WITH pkg dims ===');
for (const r of wallSample) {
  console.log(`  ${r.masterCode} | cab:${r.width}x${r.height}x${r.depth} wt:${r.weight} | pkg:${r.pkgLength}x${r.pkgWidth}x${r.pkgHeight} pkgWt:${r.pkgWeight}`);
}

// Check tall cabinets
const [tallSample] = await c.query(`
  SELECT masterCode, width, height, depth, weight, pkgLength, pkgWidth, pkgHeight, pkgWeight
  FROM cabinets 
  WHERE isActive=1 AND category='Tall' AND pkgLength > 0
  ORDER BY width
  LIMIT 10
`);
console.log('\n=== Tall cabinets WITH pkg dims ===');
for (const r of tallSample) {
  console.log(`  ${r.masterCode} | cab:${r.width}x${r.height}x${r.depth} wt:${r.weight} | pkg:${r.pkgLength}x${r.pkgWidth}x${r.pkgHeight} pkgWt:${r.pkgWeight}`);
}

// Check weight field for cabinets missing pkg dims
const [weightCheck] = await c.query(`
  SELECT masterCode, width, height, depth, weight, category
  FROM cabinets 
  WHERE isActive=1 AND (pkgLength IS NULL OR pkgLength=0) AND weight IS NOT NULL AND weight > 0
  ORDER BY category, masterCode
  LIMIT 20
`);
console.log('\n=== Missing pkg dims but HAS weight ===');
for (const r of weightCheck) {
  console.log(`  ${r.masterCode} | ${r.category} | cab:${r.width}x${r.height}x${r.depth} wt:${r.weight}`);
}

await c.end();
