import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const codes = ['DCW-24-30','W-30-30','W-36-12-24','LSB36','B-18','W-12-30','SB-36','W-18-30','DB-18-3','W-30-12'];

for (const code of codes) {
  const [rows] = await conn.execute('SELECT id, masterCode FROM cabinets WHERE masterCode = ?', [code]);
  console.log(code, rows.length > 0 ? 'FOUND (id:' + rows[0].id + ')' : 'MISSING');
}

// Also check WDC-24-30 variant
const [wdc] = await conn.execute('SELECT id, masterCode FROM cabinets WHERE masterCode = ?', ['WDC-24-30']);
console.log('\nWDC-24-30', wdc.length > 0 ? 'FOUND (id:' + wdc[0].id + ')' : 'MISSING');

// Check if WDC-24-30 or DCW-24-30 has SKUs
const [skus1] = await conn.execute('SELECT COUNT(*) as cnt FROM distributor_skus WHERE cabinetId = (SELECT id FROM cabinets WHERE masterCode = ? LIMIT 1)', ['DCW-24-30']);
const [skus2] = await conn.execute('SELECT COUNT(*) as cnt FROM distributor_skus WHERE cabinetId = (SELECT id FROM cabinets WHERE masterCode = ? LIMIT 1)', ['WDC-24-30']);
console.log('DCW-24-30 SKUs:', skus1[0].cnt);
console.log('WDC-24-30 SKUs:', skus2[0].cnt);

// Check LSB36 SKUs
const [skus3] = await conn.execute('SELECT COUNT(*) as cnt FROM distributor_skus WHERE cabinetId = (SELECT id FROM cabinets WHERE masterCode = ? LIMIT 1)', ['LSB36']);
console.log('LSB36 SKUs:', skus3[0].cnt);

await conn.end();
