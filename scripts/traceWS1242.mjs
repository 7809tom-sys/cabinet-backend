import mysql from 'mysql2/promise';
import fs from 'fs';

const DATABASE_URL = fs.readFileSync('/tmp/dburl.txt', 'utf8').trim().replace(/^DATABASE_URL=/, '');
const conn = await mysql.createConnection(DATABASE_URL);

// distributor_skus columns
const [cols] = await conn.query(`SHOW COLUMNS FROM distributor_skus`);
console.log('=== distributor_skus columns ===');
console.log(cols.map(c => c.Field).join(', '));

// cabinet id for WS-12-42 is 370
const [skus] = await conn.query(
  `SELECT * FROM distributor_skus WHERE cabinetId = 370`
);
console.log(`\n=== distributor_skus mapped to WS-12-42 (cabinetId 370): ${skus.length} ===`);
console.log(JSON.stringify(skus, null, 2));

await conn.end();
