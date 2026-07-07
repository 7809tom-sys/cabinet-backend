import 'dotenv/config';
import mysql from 'mysql2/promise';
const c = await mysql.createConnection(process.env.DATABASE_URL);

// What door_styles IDs are in the DB?
const [styles] = await c.query(`SELECT id, ourName, distributorId FROM door_styles WHERE isActive=1 LIMIT 20`);
console.log('Door styles in DB:');
for (const s of styles) console.log(`  id=${s.id} dist=${s.distributorId} name=${s.ourName}`);

// What styleIds does TK-8 have?
const [tkRows] = await c.query(`SELECT ds.styleId FROM distributor_skus ds JOIN cabinets cb ON cb.id=ds.cabinetId WHERE cb.masterCode='TK-8' AND ds.isAvailable=1 AND ds.isPublished=1`);
const tkStyleIds = tkRows.map(r => r.styleId);
console.log('\nTK-8 styleIds:', tkStyleIds);

// Do any door_styles IDs match TK-8 styleIds?
const styleIds = styles.map(s => s.id);
const overlap = styleIds.filter(id => tkStyleIds.includes(id));
console.log('Overlap:', overlap);

await c.end();
