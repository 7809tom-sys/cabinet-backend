import mysql from 'mysql2/promise';

const db = await mysql.createConnection(process.env.DATABASE_URL);

// Find all Line A door styles
const [styles] = await db.execute(`
  SELECT id, distributorId, styleCode, ourName, distributorName 
  FROM door_styles 
  WHERE distributorId = 1 
  ORDER BY id 
  LIMIT 30
`);
console.log('Line A styles:', JSON.stringify(styles, null, 2));

// Find sample SKUs for Line A to understand prefix pattern
const [skuSample] = await db.execute(`
  SELECT ds.distributorSku, ds.yourCost, ds.listPrice, ds.doorStyleId
  FROM distributor_skus ds
  WHERE ds.distributorId = 1
  ORDER BY ds.doorStyleId, ds.distributorSku
  LIMIT 20
`);
console.log('Line A SKU sample:', JSON.stringify(skuSample, null, 2));

await db.end();
