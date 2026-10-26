import 'dotenv/config';
import mysql from 'mysql2/promise';
const c = await mysql.createConnection(process.env.DATABASE_URL);

// Get range hood cabinet details
const [cabs] = await c.query(`
  SELECT c.id, c.masterCode, c.description, c.category, c.subCategory, c.width, c.height, c.depth, c.weight,
         c.catalogImageUrl
  FROM cabinets c
  WHERE c.masterCode IN ('RH-15-42','RHC-06-30','RHF30','RHF36') AND c.isActive=1
  ORDER BY c.masterCode
`);
console.log('=== Range Hood Cabinets ===');
for (const r of cabs) {
  console.log(`\n${r.masterCode} | ${r.description}`);
  console.log(`  Category: ${r.category} / ${r.subCategory}`);
  console.log(`  Dims: ${r.width}x${r.height}x${r.depth} wt:${r.weight}`);
  console.log(`  Image: ${r.catalogImageUrl}`);
}

// Get distributor SKUs for these cabinets
const ids = cabs.map(r => r.id);
if (ids.length) {
  const [skus] = await c.query(`
    SELECT ds.cabinetId, ds.sku, ds.distributorCost, ds.msrp, d.name as distributor, ds.styleId
    FROM distributorSkus ds
    JOIN distributors d ON ds.distributorId = d.id
    WHERE ds.cabinetId IN (${ids.join(',')})
    ORDER BY ds.cabinetId, d.name
  `);
  console.log('\n=== Distributor SKUs ===');
  for (const s of skus) {
    const cab = cabs.find(c => c.id === s.cabinetId);
    console.log(`  ${cab?.masterCode} | ${s.distributor} | SKU:${s.sku} | cost:${s.distributorCost} msrp:${s.msrp} styleId:${s.styleId}`);
  }
}

await c.end();
