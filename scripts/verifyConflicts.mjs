import mysql from 'mysql2/promise';
import fs from 'fs';

const DATABASE_URL = fs.readFileSync('/tmp/dburl.txt', 'utf8').trim().replace(/^DATABASE_URL=/, '');
const conn = await mysql.createConnection(DATABASE_URL);

const [items] = await conn.query(
  `SELECT id, masterCode, description, category, subCategory, width, height, depth, conflictReason
   FROM cabinets WHERE conflictStatus = 'conflict' ORDER BY masterCode`
);
const ids = items.map(i => i.id);
const [skus] = await conn.query(
  `SELECT ds.cabinetId, d.name AS distributorName, st.ourName AS styleName, st.styleCode
   FROM distributor_skus ds
   LEFT JOIN distributors d ON d.id = ds.distributorId
   LEFT JOIN door_styles st ON st.id = ds.styleId
   WHERE ds.cabinetId IN (${ids.join(',')})`
);
const byCab = {};
for (const s of skus) (byCab[s.cabinetId] ??= []).push(s);

console.log(`Conflict items: ${items.length}\n`);
for (const c of items) {
  const list = byCab[c.id] || [];
  const dists = [...new Set(list.map(s => s.distributorName).filter(Boolean))];
  const styles = [...new Set(list.map(s => s.styleName ? `${s.styleName} (${s.styleCode})` : null).filter(Boolean))];
  console.log(`• ${c.masterCode} — ${c.description}`);
  console.log(`    ${c.category}/${c.subCategory} | ${c.width}x${c.height}x${c.depth} | ${list.length} SKUs`);
  console.log(`    Distributors: ${dists.join(', ') || '—'}`);
  console.log(`    Door styles: ${styles.length ? styles.slice(0,6).join(', ') + (styles.length>6?` …(+${styles.length-6})`:'') : '—'}`);
}
await conn.end();
