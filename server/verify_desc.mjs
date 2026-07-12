import { createConnection } from 'mysql2/promise';
const db = await createConnection(process.env.DATABASE_URL);

const [rows] = await db.query(`
  SELECT masterCode, description FROM cabinets 
  WHERE masterCode IN ('3DB12','3DB24','ADA-3DB12','B24','B36','W3030','3DB15')
  ORDER BY masterCode
`);

for (const r of rows) {
  console.log(`${r.masterCode}: "${r.description}"`);
}

// Check how many still have -3DR
const [cnt] = await db.query(`SELECT COUNT(*) as n FROM cabinets WHERE description LIKE '%-3DR%'`);
console.log(`\nStill have -3DR: ${cnt[0].n}`);

// Check ADA cabinets
const [ada] = await db.query(`SELECT masterCode, description FROM cabinets WHERE masterCode LIKE 'ADA-%' LIMIT 5`);
console.log('\nADA samples:');
for (const r of ada) console.log(`  ${r.masterCode}: "${r.description}"`);

await db.end();
