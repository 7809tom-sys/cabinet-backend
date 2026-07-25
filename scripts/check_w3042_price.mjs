import { createConnection } from 'mysql2/promise';

const conn = await createConnection(process.env.DATABASE_URL);

// Check W3042 pricing
const [rows] = await conn.query(`
  SELECT ds.platformSku, ds.distributorSku, ds.listPrice, ds.yourCost,
         dstyle.styleCode, dstyle.ourName, dist.name as distName
  FROM distributor_skus ds
  JOIN cabinets c ON ds.cabinetId = c.id
  JOIN door_styles dstyle ON ds.styleId = dstyle.id
  JOIN distributors dist ON ds.distributorId = dist.id
  WHERE c.masterCode = 'W3042'
    AND dist.id = 210002
  ORDER BY dstyle.styleCode
  LIMIT 20
`);

console.log('\nW3042 pricing in database:');
console.log('platformSku | listPrice | ourCost | ratio');
for (const r of rows) {
  const ratio = r.yourCost && r.listPrice ? (r.yourCost / r.listPrice).toFixed(4) : 'N/A';
  console.log(`${r.platformSku} | list=$${r.listPrice} | cost=$${r.yourCost} | ratio=${ratio}`);
}

// You pay $201.71 for W3042 — figure out which style that is
// The Capital spec book groups:
// Group 1 (SW/SA/SD/SG/SU): lowest price
// Group 2 (SI/SN/SB/SH/SC/EW): mid
// Group 3 (OW/OC/OS/CW/CS/HD/HS/HH): higher
// Group 4 (OM/OT/HR/HE/SEO): highest

// Check what list prices exist for W3042
const listPrices = [...new Set(rows.map(r => r.listPrice))].sort((a,b) => a-b);
console.log('\nUnique list prices for W3042:', listPrices);
console.log('\nYou pay $201.71 — implied multipliers:');
for (const lp of listPrices) {
  if (lp > 0) {
    const mult = (201.71 / lp).toFixed(4);
    console.log(`  list=$${lp} → multiplier=${mult} (${(mult*100).toFixed(1)}%)`);
  }
}

await conn.end();
