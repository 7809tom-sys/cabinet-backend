import { createConnection } from 'mysql2/promise';

const db = await createConnection(process.env.DATABASE_URL);

// Check what descriptions actually look like for FG cabinets
const [rows] = await db.query(`
  SELECT c.masterCode, c.description, ds.ourName as styleName
  FROM cabinets c
  JOIN distributor_skus dsk ON dsk.cabinetId = c.id
  JOIN door_styles ds ON ds.id = dsk.styleId
  WHERE ds.ourName = 'Floral Grey'
  LIMIT 20
`);

console.log('Sample Floral Grey cabinet descriptions:');
for (const r of rows) {
  console.log(`  ${r.masterCode}: "${r.description}"`);
}

// Also check what the cabinets table description field looks like (not linked to style)
const [rows2] = await db.query(`
  SELECT masterCode, description FROM cabinets 
  WHERE masterCode LIKE '3DB%' OR masterCode LIKE 'FG-%'
  LIMIT 20
`);

console.log('\nSample cabinet descriptions (by masterCode):');
for (const r of rows2) {
  console.log(`  ${r.masterCode}: "${r.description}"`);
}

await db.end();
