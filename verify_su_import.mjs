import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Count cabinets by category
const [cats] = await conn.execute(`
  SELECT category, COUNT(*) as cnt 
  FROM cabinets WHERE masterCode LIKE 'SU-%' OR masterCode LIKE 'Unfinished-%'
  GROUP BY category ORDER BY category
`);
console.log('=== SU Cabinet Records by Category ===');
for (const r of cats) console.log(`  ${r.category}: ${r.cnt}`);

// Count distributor_skus
const [dskus] = await conn.execute(`
  SELECT COUNT(*) as total,
    SUM(isPublished) as published,
    SUM(isAvailable) as available,
    SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) as approved
  FROM distributor_skus WHERE styleId = 150002
`);
console.log('\n=== SU Distributor SKUs (styleId=150002) ===');
const r = dskus[0];
console.log(`  Total: ${r.total}  Published: ${r.published}  Available: ${r.available}  Approved: ${r.approved}`);

// Check for any conflict status
const [conflicts] = await conn.execute(`
  SELECT COUNT(*) as cnt FROM cabinets 
  WHERE (masterCode LIKE 'SU-%' OR masterCode LIKE 'Unfinished-%') 
    AND conflictStatus = 'conflict'
`);
console.log(`\n=== Conflict Status ===`);
console.log(`  In conflict: ${conflicts[0].cnt}`);

// Sample 5 records
const [samples] = await conn.execute(`
  SELECT c.masterCode, c.category, c.subCategory, c.width, c.height, c.depth,
         ds.listPrice, ds.isPublished, ds.status
  FROM cabinets c
  JOIN distributor_skus ds ON ds.cabinetId = c.id
  WHERE ds.styleId = 150002
  ORDER BY c.id
  LIMIT 5
`);
console.log('\n=== Sample Records ===');
for (const s of samples) {
  console.log(`  ${s.masterCode} | ${s.category}/${s.subCategory} | ${s.width}x${s.height}x${s.depth} | $${s.listPrice} | published=${s.isPublished} | ${s.status}`);
}

await conn.end();
