import 'dotenv/config';
import mysql from 'mysql2/promise';
const c = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await c.query("SELECT masterCode, description, category FROM cabinets WHERE isActive=1");
const byPrefix = {};
for (const r of rows) {
  const p = (r.masterCode.match(/^[A-Z]+/i)||[''])[0].toUpperCase();
  (byPrefix[p] ||= []).push(r.masterCode);
}
const keys = Object.keys(byPrefix).sort();
console.log('Distinct prefixes ('+keys.length+'):');
for (const k of keys) console.log(k.padEnd(8), byPrefix[k].length, 'e.g.', byPrefix[k].slice(0,3).join(', '));
// show filler / corner / wall-corner / lazy susan descriptions
console.log('--- filler/corner/lazy/wall-corner samples ---');
for (const r of rows) {
  const d = (r.description||'').toLowerCase();
  if (/filler|lazy|diagonal corner|wall corner|blind|easy reach/.test(d)) console.log(r.masterCode.padEnd(14),'|',r.description.slice(0,55));
}
await c.end();
