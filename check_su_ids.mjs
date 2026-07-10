import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Get all distributors
const [dists] = await conn.execute('SELECT id, code, name, brandName FROM distributors ORDER BY id');
console.log('=== DISTRIBUTORS ===');
for (const d of dists) {
  console.log(`  id=${d.id}  code=${d.code}  name=${d.name}  brand=${d.brandName}`);
}

// Get door styles - look for Shaker Unfinished
const [styles] = await conn.execute(`
  SELECT ds.id, ds.styleCode, ds.ourName, ds.distributorName, ds.distributorId, d.code as distCode
  FROM door_styles ds
  JOIN distributors d ON d.id = ds.distributorId
  WHERE ds.distributorName LIKE '%Unfinished%' 
     OR ds.styleCode LIKE '%SU%' 
     OR ds.ourName LIKE '%Unfinished%'
     OR ds.ourName LIKE '%Shaker Un%'
  ORDER BY ds.id
`);
console.log('\n=== SHAKER UNFINISHED DOOR STYLES ===');
for (const s of styles) {
  console.log(`  id=${s.id}  styleCode=${s.styleCode}  ourName=${s.ourName}  distName=${s.distributorName}  distId=${s.distributorId}(${s.distCode})`);
}

// Also check existing SU SKUs in distributor_skus
const [existing] = await conn.execute(`
  SELECT COUNT(*) as cnt, ds.distributorId, ds.styleId
  FROM distributor_skus ds
  WHERE ds.distributorSku LIKE 'SU-%'
  GROUP BY ds.distributorId, ds.styleId
`);
console.log('\n=== EXISTING SU- SKUs in distributor_skus ===');
for (const r of existing) {
  console.log(`  count=${r.cnt}  distributorId=${r.distributorId}  styleId=${r.styleId}`);
}

// Check existing cabinet masterCodes for SU-
const [cabs] = await conn.execute(`
  SELECT COUNT(*) as cnt, category FROM cabinets WHERE masterCode LIKE 'SU-%' GROUP BY category
`);
console.log('\n=== EXISTING SU- cabinets ===');
for (const c of cabs) {
  console.log(`  category=${c.category}  count=${c.cnt}`);
}

await conn.end();
