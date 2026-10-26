import { createConnection } from 'mysql2/promise';

const conn = await createConnection(process.env.DATABASE_URL);

try {
  // Get all door style distributor names to build the prefix exclusion list
  const [styleNames] = await conn.execute(`SELECT DISTINCT distributorName FROM door_styles WHERE distributorName IS NOT NULL`);
  const stylePrefixes = styleNames.map(r => r.distributorName).filter(Boolean);
  
  // Also add known static prefixes
  const staticPrefixes = ['SU-', 'Unfinished-'];
  
  // Get all wall cabinet SKUs
  const [wallCabs] = await conn.execute(`SELECT id, masterCode FROM cabinets WHERE category = 'Wall'`);
  
  const toDelete = [];
  for (const row of wallCabs) {
    const mc = row.masterCode;
    
    // Check static prefixes
    const isStaticPrefix = staticPrefixes.some(p => mc.startsWith(p));
    if (isStaticPrefix) {
      toDelete.push({ id: row.id, masterCode: mc, reason: 'static prefix' });
      continue;
    }
    
    // Check style name prefixes (e.g. "Cashmere-", "ANTIQUE WHITE-", "DOVE-")
    const isStylePrefix = stylePrefixes.some(p => mc.startsWith(p + '-') || mc.startsWith(p + ' '));
    if (isStylePrefix) {
      toDelete.push({ id: row.id, masterCode: mc, reason: 'style prefix' });
    }
  }
  
  console.log(`Wall SKUs to delete: ${toDelete.length}`);
  console.log('Sample:');
  toDelete.slice(0, 15).forEach(r => console.log(`  ${r.masterCode} (${r.reason})`));
  
  if (toDelete.length > 0) {
    const ids = toDelete.map(r => r.id);
    const placeholders = ids.map(() => '?').join(',');
    const [delResult] = await conn.execute(
      `DELETE FROM cabinets WHERE id IN (${placeholders})`,
      ids
    );
    console.log(`\nDeleted ${delResult.affectedRows} style-prefixed wall SKUs`);
  }
  
  // Final count
  const [remaining] = await conn.execute(`SELECT COUNT(*) as cnt FROM cabinets WHERE category = 'Wall'`);
  console.log(`\nRemaining Wall SKUs: ${remaining[0].cnt}`);
  
  // Show remaining by subCategory
  const [bySub] = await conn.execute(`
    SELECT subCategory, COUNT(*) as cnt FROM cabinets 
    WHERE category = 'Wall' 
    GROUP BY subCategory ORDER BY cnt DESC
  `);
  console.log('\nBy subCategory:');
  bySub.forEach(r => console.log(`  ${(r.subCategory || 'None').padEnd(35)} ${r.cnt}`));

} finally {
  await conn.end();
}
