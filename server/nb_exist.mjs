import 'dotenv/config';
import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [cabs] = await conn.query("SELECT masterCode FROM cabinets");
const set = new Set(cabs.map(c=>c.masterCode && c.masterCode.trim().toUpperCase()).filter(Boolean));
const strip = new Set([...set].map(c=>c.replace(/-/g,'')));
const tests = ['FHB-12','FHB12','V-24-21DL','V2421DL','W-18-18','W1818','W-18-30-24','W183024','FHB-15','FHB-21','FHB-27'];
for (const t of tests) {
  console.log(`${t}: exact=${set.has(t)} strip=${strip.has(t.replace(/-/g,''))}`);
}
console.log("\nAll FHB cabinets:", [...set].filter(c=>c.startsWith('FHB')).join(', '));
console.log("All V- vanity cabinets (sample):", [...set].filter(c=>c.startsWith('V-')).slice(0,20).join(', '));
console.log("All W-18 wall cabinets:", [...set].filter(c=>c.startsWith('W-18')).join(', '));
await conn.end();
