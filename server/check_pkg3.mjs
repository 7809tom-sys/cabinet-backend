import 'dotenv/config';
import mysql from 'mysql2/promise';
const c = await mysql.createConnection(process.env.DATABASE_URL);

const codes = ['FHB12','FHB27','FHB42','W-39-36','W-42-42','LS-33-12','DCSB-36','BA-24','BF-3','LCM8','FFS36','V3021','TB09'];
const [rows] = await c.query(
  `SELECT masterCode, category, width, height, depth, weight, pkgLength, pkgWidth, pkgHeight, pkgWeight 
   FROM cabinets WHERE masterCode IN (${codes.map(()=>'?').join(',')}) ORDER BY category, masterCode`,
  codes
);
console.log('Spot check:');
for (const r of rows) {
  console.log(`  ${r.masterCode} [${r.category}] cab:${r.width}x${r.height}x${r.depth} wt:${r.weight} | pkg:${r.pkgLength}x${r.pkgWidth}x${r.pkgHeight} pkgWt:${r.pkgWeight}`);
}

// Summary
const [[s]] = await c.query(`SELECT COUNT(*) as total, SUM(pkgLength>0) as hasL, SUM(pkgLength IS NULL OR pkgLength=0) as missingL FROM cabinets WHERE isActive=1`);
console.log(`\nTotal: ${s.total} | Has pkgLength: ${s.hasL} | Missing: ${s.missingL}`);

await c.end();
