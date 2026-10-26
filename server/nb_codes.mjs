import 'dotenv/config';
import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [cabs] = await conn.query("SELECT masterCode FROM cabinets ORDER BY masterCode");
const codes = cabs.map(c=>c.masterCode).filter(Boolean);
console.log("total cabinets:", codes.length);
// Show a spread of code formats
const samples = ['B-12','B-24','DB-15-3','DB-33','FHB-12','FHB12','MD-15-30','PG-24-36','W-30-30','V-24-21','2DB','BSR-9','SB-33'];
for (const s of samples) {
  const hit = codes.filter(c=>c.toUpperCase().replace(/-/g,'')===s.toUpperCase().replace(/-/g,''));
  console.log(`strip-match "${s}" ->`, hit.slice(0,5).join(', ') || '(none)');
}
console.log("\nSample of raw codes containing FHB / MD / PG / SB / DB:");
for (const p of ['FHB','MD','PG','SB','DB','V','W']) {
  const hit = codes.filter(c=>c.toUpperCase().startsWith(p));
  console.log(`${p}: ${hit.slice(0,8).join(', ')}`);
}
await conn.end();
