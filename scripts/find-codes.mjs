import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Find diagonal corner wall cabinets
const [diag] = await conn.execute(
  `SELECT id, masterCode, description, subCategory FROM cabinets WHERE masterCode LIKE '%WDC%' OR masterCode LIKE '%DCW%' OR masterCode LIKE '%DW-%' LIMIT 20`
);
console.log('=== Diagonal Wall ===');
diag.forEach(r => console.log(r.masterCode, '|', r.description?.slice(0,50), '|', r.subCategory));

// Find lazy susan / easy reach base cabinets
const [ls] = await conn.execute(
  `SELECT id, masterCode, description, subCategory FROM cabinets WHERE masterCode LIKE '%LS%' OR masterCode LIKE '%EZR%' OR masterCode LIKE 'ER-%' LIMIT 20`
);
console.log('\n=== Lazy Susan / Easy Reach ===');
ls.forEach(r => console.log(r.masterCode, '|', r.description?.slice(0,50), '|', r.subCategory));

// Also try searching by description
const [byDesc] = await conn.execute(
  `SELECT id, masterCode, description, subCategory FROM cabinets WHERE description LIKE '%diagonal%' OR description LIKE '%lazy%susan%' OR description LIKE '%easy%reach%' LIMIT 20`
);
console.log('\n=== By Description ===');
byDesc.forEach(r => console.log(r.masterCode, '|', r.description?.slice(0,50), '|', r.subCategory));

await conn.end();
