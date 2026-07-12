import { createConnection } from 'mysql2/promise';

const conn = await createConnection(process.env.DATABASE_URL);

try {
  // Step 1: Get all OC- masterCodes and their base equivalents
  const [ocCabs] = await conn.execute(`SELECT id, masterCode FROM cabinets WHERE masterCode LIKE 'OC-%'`);
  
  const toDelete = [];
  for (const row of ocCabs) {
    const baseCode = row.masterCode.replace(/^OC-/, '');
    // Check if the base code exists (meaning this OC- is a duplicate)
    const [existing] = await conn.execute(
      `SELECT id FROM cabinets WHERE masterCode = ? LIMIT 1`,
      [baseCode]
    );
    if (existing.length > 0) {
      toDelete.push(row.id);
    }
  }

  console.log(`Found ${toDelete.length} duplicate OC- rows to delete`);

  // Step 2: Delete them in batches
  if (toDelete.length > 0) {
    const placeholders = toDelete.map(() => '?').join(',');
    const [delResult] = await conn.execute(
      `DELETE FROM cabinets WHERE id IN (${placeholders})`,
      toDelete
    );
    console.log(`Deleted ${delResult.affectedRows} duplicate OC- rows`);
  }

  // Step 3: Rename duplicate category names
  const [wallRename] = await conn.execute(
    `UPDATE cabinets SET category = 'Wall' WHERE category = 'Wall Cabinets'`
  );
  console.log(`Renamed 'Wall Cabinets' → 'Wall': ${wallRename.affectedRows} rows`);

  const [baseRename] = await conn.execute(
    `UPDATE cabinets SET category = 'Base' WHERE category = 'Base Cabinets'`
  );
  console.log(`Renamed 'Base Cabinets' → 'Base': ${baseRename.affectedRows} rows`);

  const [tallRename] = await conn.execute(
    `UPDATE cabinets SET category = 'Tall' WHERE category = 'Tall Cabinets'`
  );
  console.log(`Renamed 'Tall Cabinets' → 'Tall': ${tallRename.affectedRows} rows`);

  // Step 4: Final count
  const [total] = await conn.execute(`SELECT COUNT(*) as cnt FROM cabinets`);
  const [generic] = await conn.execute(
    `SELECT COUNT(*) as cnt FROM cabinets WHERE category NOT IN ('Accessory','Accessories')`
  );
  const [byCat] = await conn.execute(
    `SELECT category, COUNT(*) as cnt FROM cabinets WHERE category NOT IN ('Accessory','Accessories') GROUP BY category ORDER BY cnt DESC`
  );

  console.log(`\nTotal cabinets: ${total[0].cnt}`);
  console.log(`Generic (non-accessory): ${generic[0].cnt}`);
  console.log('\nBy category:');
  byCat.forEach(r => console.log(`  ${r.category.padEnd(25)} ${r.cnt}`));

} finally {
  await conn.end();
}
