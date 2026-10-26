import { createConnection } from 'mysql2/promise';

const conn = await createConnection(process.env.DATABASE_URL);

try {
  // Get all door style distributor names
  const [styleNames] = await conn.execute(`SELECT DISTINCT distributorName FROM door_styles WHERE distributorName IS NOT NULL`);
  const stylePrefixes = styleNames.map(r => r.distributorName).filter(Boolean);
  
  // Static prefixes that are always style-specific
  const staticPrefixes = ['SU-', 'Unfinished-'];
  
  // Get all non-accessory cabinets
  const [allCabs] = await conn.execute(`
    SELECT id, masterCode, category FROM cabinets 
    WHERE category NOT IN ('Accessory','Accessories','ADA')
  `);
  
  const toDelete = [];
  for (const row of allCabs) {
    const mc = row.masterCode;
    
    // Check static prefixes
    const isStaticPrefix = staticPrefixes.some(p => mc.startsWith(p));
    if (isStaticPrefix) {
      toDelete.push({ id: row.id, masterCode: mc, category: row.category, reason: 'static prefix' });
      continue;
    }
    
    // Check style name prefixes
    const isStylePrefix = stylePrefixes.some(p => mc.startsWith(p + '-') || mc.startsWith(p + ' '));
    if (isStylePrefix) {
      toDelete.push({ id: row.id, masterCode: mc, category: row.category, reason: 'style prefix' });
    }
  }
  
  console.log(`Style-prefixed SKUs to delete across all categories: ${toDelete.length}`);
  
  // Show breakdown by category
  const byCat = {};
  for (const r of toDelete) {
    byCat[r.category] = (byCat[r.category] || 0) + 1;
  }
  console.log('\nBy category:');
  Object.entries(byCat).sort((a,b) => b[1]-a[1]).forEach(([cat, cnt]) => {
    console.log(`  ${cat.padEnd(25)} ${cnt}`);
  });
  
  // Show 10 samples
  console.log('\nSample (first 10):');
  toDelete.slice(0, 10).forEach(r => console.log(`  [${r.category}] ${r.masterCode} (${r.reason})`));
  
  if (toDelete.length > 0) {
    const ids = toDelete.map(r => r.id);
    const placeholders = ids.map(() => '?').join(',');
    const [delResult] = await conn.execute(
      `DELETE FROM cabinets WHERE id IN (${placeholders})`,
      ids
    );
    console.log(`\nDeleted ${delResult.affectedRows} style-prefixed SKUs`);
  }
  
  // Final count by category
  const [byCatFinal] = await conn.execute(`
    SELECT category, COUNT(*) as cnt FROM cabinets 
    WHERE category NOT IN ('Accessory','Accessories')
    GROUP BY category ORDER BY cnt DESC
  `);
  console.log('\n=== Final counts by category ===');
  let total = 0;
  byCatFinal.forEach(r => {
    console.log(`  ${r.category.padEnd(25)} ${r.cnt}`);
    total += r.cnt;
  });
  console.log(`  ${'TOTAL'.padEnd(25)} ${total}`);

} finally {
  await conn.end();
}
