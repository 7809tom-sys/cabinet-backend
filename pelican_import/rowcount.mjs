import mysql from 'mysql2/promise';
const c = await mysql.createConnection(process.env.DATABASE_URL);
const [[{n}]] = await c.query('SELECT COUNT(*) n FROM pelican_products');
console.log('ROWS:', n);
await c.end();
