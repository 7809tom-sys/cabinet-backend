import 'dotenv/config';
import mysql from 'mysql2/promise';
const c = await mysql.createConnection(process.env.DATABASE_URL);

// Summary
const [[s]] = await c.query(`
  SELECT 
    COUNT(*) as total,
    SUM(pkgLength > 0) as hasL,
    SUM(pkgWidth > 0) as hasW,
    SUM(pkgHeight > 0) as hasH,
    SUM(pkgWeight > 0) as hasWt,
    SUM(pkgLength IS NULL OR pkgLength = 0 OR pkgWidth IS NULL OR pkgWidth = 0 OR pkgHeight IS NULL OR pkgHeight = 0) as missingDims
  FROM cabinets WHERE isActive=1
`);
console.log(`Total: ${s.total} | Has dims: L=${s.hasL} W=${s.hasW} H=${s.hasH} | Has weight: ${s.hasWt} | Missing any dim: ${s.missingDims}`);

// Show cabinets missing dims
const [missing] = await c.query(`
  SELECT masterCode, description, width, height, depth, pkgLength, pkgWidth, pkgHeight, pkgWeight
  FROM cabinets 
  WHERE isActive=1 AND (pkgLength IS NULL OR pkgLength=0 OR pkgWidth IS NULL OR pkgWidth=0 OR pkgHeight IS NULL OR pkgHeight=0)
  ORDER BY masterCode
  LIMIT 50
`);
console.log(`\nSample missing dims (${missing.length} shown):`);
for (const r of missing) {
  console.log(`  ${r.masterCode} | cab:${r.width}x${r.height}x${r.depth} | pkg:${r.pkgLength}x${r.pkgWidth}x${r.pkgHeight} wt:${r.pkgWeight}`);
}

await c.end();
