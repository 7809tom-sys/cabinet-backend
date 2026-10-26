import mysql from 'mysql2/promise';
const db = await mysql.createConnection(process.env.DATABASE_URL);
const [cols] = await db.execute('DESCRIBE distributor_skus');
console.log('Columns:', cols.map(c => c.Field).join(', '));
// Also check a sample row
const [sample] = await db.execute('SELECT * FROM distributor_skus WHERE distributorId = 1 LIMIT 1');
console.log('Sample row keys:', Object.keys(sample[0] || {}).join(', '));
await db.end();
