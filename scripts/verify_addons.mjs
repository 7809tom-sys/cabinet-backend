// Verify touch-up kit + roll-out tray rows and their published SKU availability.
import mysql from 'mysql2/promise';
const url = process.env.DATABASE_URL;
if (!url) { console.error('No DATABASE_URL'); process.exit(1); }
const conn = await mysql.createConnection(url);

const [rows] = await conn.query(
  `SELECT id, masterCode, category, subCategory, isActive
   FROM cabinets
   WHERE masterCode = 'TUK' OR subCategory = 'Roll-Out Tray' OR masterCode LIKE 'RS-%'
   ORDER BY masterCode`
);
console.log('=== Add-on catalog rows ===');
for (const r of rows) {
  console.log(`${r.id}\t${r.masterCode}\t${r.category}\t${r.subCategory || ''}\tactive=${r.isActive}`);
}

// How many published+available SKUs (any style) back each row?
const ids = rows.map(r => r.id);
if (ids.length) {
  const [skus] = await conn.query(
    `SELECT cabinetId, COUNT(*) AS n,
            SUM(CASE WHEN isAvailable=1 AND isPublished=1 THEN 1 ELSE 0 END) AS buyable
     FROM distributor_skus WHERE cabinetId IN (?) GROUP BY cabinetId`, [ids]
  );
  const map = new Map(skus.map(s => [s.cabinetId, s]));
  console.log('\n=== SKU availability per add-on ===');
  for (const r of rows) {
    const s = map.get(r.id);
    console.log(`${r.masterCode}\tskus=${s?.n ?? 0}\tbuyable=${s?.buyable ?? 0}`);
  }
}

// Also confirm the OE-6 oven fillers reclass and current Accessory subcat tally.
const [acc] = await conn.query(
  `SELECT subCategory, COUNT(*) n FROM cabinets WHERE category='Accessory' GROUP BY subCategory ORDER BY n DESC`
);
console.log('\n=== Accessory subCategory tally ===');
for (const a of acc) console.log(`${a.subCategory || '(null)'}\t${a.n}`);

const [oe] = await conn.query(
  `SELECT masterCode, category, subCategory FROM cabinets WHERE masterCode LIKE 'OE-6%' ORDER BY masterCode`
);
console.log('\n=== OE-6 oven fillers ===');
for (const o of oe) console.log(`${o.masterCode}\t${o.category}\t${o.subCategory || ''}`);

await conn.end();
