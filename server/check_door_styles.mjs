import mysql from 'mysql2/promise';
const db = await mysql.createConnection(process.env.DATABASE_URL);
const [cols] = await db.execute('DESCRIBE door_styles');
console.log('Columns:', cols.map(c => c.Field).join(', '));
const [rows] = await db.execute('SELECT * FROM door_styles LIMIT 3');
console.log('Sample:', JSON.stringify(rows, null, 2));
await db.end();
