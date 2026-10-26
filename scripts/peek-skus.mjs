import 'dotenv/config';
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Pick one generic drawer base cabinet
const [cabs] = await conn.query(
  "SELECT id, masterCode, description FROM cabinets WHERE description LIKE '%Drawer Base%' ORDER BY masterCode LIMIT 1"
);
console.log('GENERIC CABINET:', JSON.stringify(cabs[0]));
const cabId = cabs[0].id;

// Show its SKUs across colors
const [skus] = await conn.query(
  `SELECT s.platformSku, s.distributorSku, d.ourName AS family, d.color, s.isPublished, s.isAvailable
     FROM distributor_skus s
     JOIN door_styles d ON d.id = s.styleId
    WHERE s.cabinetId = ?
    ORDER BY d.ourName
    LIMIT 8`,
  [cabId]
);
console.log('\nSKUs for this cabinet across colors (first 8):');
for (const r of skus) {
  console.log(
    '  ' + r.platformSku + '  | family=' + r.family + ' | color=' + r.color +
      ' | distSku=' + r.distributorSku + ' | published=' + r.isPublished
  );
}

const [[cnt]] = await conn.query(
  'SELECT COUNT(*) AS n FROM distributor_skus WHERE cabinetId = ?',
  [cabId]
);
console.log('\nTotal SKUs for this one cabinet:', cnt.n);

const [[tot]] = await conn.query('SELECT COUNT(*) AS n FROM distributor_skus');
console.log('Total SKUs in table:', tot.n);
await conn.end();
