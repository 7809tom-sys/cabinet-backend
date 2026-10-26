import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const skus = ['W3612', 'VDEP', 'U309624', 'U309024', 'U308424', 'U249624', 'U249024', 'U189624', 'U189024', 'U188424', 'LSB36', 'LSB33', 'B36FH', 'B33FH', 'B30FH'];

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Check distinct prices per SKU
for (const sku of skus) {
  const [rows] = await conn.query(
    'SELECT distributorSku, listPrice, yourCost, status FROM distributor_skus WHERE distributorSku = ? AND status = "approved" LIMIT 1',
    [sku]
  );
  if (rows.length > 0) {
    const r = rows[0];
    console.log(`${r.distributorSku}: $${r.listPrice} (yourCost: $${r.yourCost})`);
  } else {
    console.log(`${sku}: NOT FOUND as approved`);
  }
}

await conn.end();
