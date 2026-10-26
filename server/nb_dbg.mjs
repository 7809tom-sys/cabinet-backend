import 'dotenv/config';
import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [cabs] = await conn.query("SELECT masterCode FROM cabinets");
const set = new Set(cabs.map(c=>c.masterCode && c.masterCode.trim().toUpperCase()).filter(Boolean));
const stripSet = new Set([...set].map(c=>c.replace(/-/g,'')));
// For each test compact code, find any cabinet whose stripped form matches, and list what exists for the prefix.
const tests = ['FHB18','W3030','DB33','V3021DL','MD1530','WR3015','FFS24','FHB12','W1230','VDB1221'];
for (const t of tests) {
  const stripped = t.toUpperCase();
  const hitStrip = stripSet.has(stripped);
  const prefix = (t.match(/^[A-Za-z]+/)||[''])[0];
  const candidates = [...set].filter(c=>c.replace(/-/g,'').startsWith(prefix) && c.replace(/-/g,'').includes(t.replace(/[A-Za-z]/g,'').slice(0,4)));
  console.log(`${t}: stripMatch=${hitStrip}  sample cabinets for ${prefix}: ${[...set].filter(c=>c.startsWith(prefix)).slice(0,6).join(', ')}`);
}
await conn.end();
