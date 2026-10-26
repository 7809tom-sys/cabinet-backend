import mysql from 'mysql2/promise';
const db = await mysql.createConnection(process.env.DATABASE_URL);

// Check for duplicate masterCodes
const [dups] = await db.execute(`
  SELECT masterCode, COUNT(*) as cnt 
  FROM cabinets 
  GROUP BY masterCode 
  HAVING cnt > 1 
  ORDER BY cnt DESC 
  LIMIT 30
`);
console.log('Duplicate masterCodes count:', dups.length);
console.log('First 10:', JSON.stringify(dups.slice(0, 10), null, 2));

// Check total cabinets
const [[total]] = await db.execute('SELECT COUNT(*) as cnt FROM cabinets');
console.log('Total cabinets:', total.cnt);

// Check how many unique masterCodes
const [[unique]] = await db.execute('SELECT COUNT(DISTINCT masterCode) as cnt FROM cabinets');
console.log('Unique masterCodes:', unique.cnt);

await db.end();
