import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const db = await mysql.createConnection(process.env.DATABASE_URL);

const [rows] = await db.query(`
  SELECT ds.styleCode, ds.ourName, ds.distributorName, COUNT(sk.id) as skuCount 
  FROM door_styles ds 
  LEFT JOIN distributor_skus sk ON sk.styleId = ds.id AND sk.isAvailable = 1 
  WHERE ds.distributorId = 1 
  GROUP BY ds.id 
  ORDER BY ds.styleCode
`);

// Authoritative list of all 21 Madison styles
const authList = {
  SA: 'Shaker Antique White',
  SD: 'Shaker Dove',
  SG: 'Shaker Grey',
  SW: 'Shaker White',
  SI: 'Shaker Ivy',
  SN: 'Shaker Navy',
  SB: 'Shaker Black',
  SH: 'Shaker Honey',
  SC: 'Shaker Cinder',
  EW: 'Edgeline White',
  OW: 'Oxford White',
  OS: 'Oxford Sage',
  CW: 'Casselberry Antique White',
  CS: 'Casselberry Saddle',
  HD: 'Haven Dune',
  OM: 'Oxford Mist',
  OT: 'Oxford Toffee',
  HE: 'Haven Ember',
  SEO: 'Shaker Essence Oak',
  SU: 'Shanker Unfinished',
  OC: 'Oxford Cashmere',
};

console.log('\n=== US Cabinet Depot (Madison) Upload Tracker ===\n');
console.log('Code  | Our Name (Brand)               | Distributor Name               | SKUs  | Status');
console.log('------|-------------------------------|-------------------------------|-------|--------');

let uploaded = 0, partial = 0, pending = 0;
for (const [code, distName] of Object.entries(authList)) {
  const row = rows.find(r => r.styleCode === code);
  const skuCount = row ? Number(row.skuCount) : 0;
  const ourName = row ? row.ourName : '(not found)';
  let status;
  if (skuCount >= 200) { status = '✅ Uploaded'; uploaded++; }
  else if (skuCount > 0) { status = '⚠️  Partial'; partial++; }
  else { status = '❌ Pending'; pending++; }
  console.log(`${code.padEnd(6)}| ${ourName.padEnd(31)}| ${distName.padEnd(31)}| ${String(skuCount).padEnd(6)}| ${status}`);
}

console.log('\n---');
console.log(`✅ Fully uploaded: ${uploaded}/21`);
console.log(`⚠️  Partial:        ${partial}/21`);
console.log(`❌ Pending:         ${pending}/21`);
const total = rows.reduce((s, r) => s + Number(r.skuCount), 0);
console.log(`\nTotal Madison SKUs: ${total}`);

await db.end();
