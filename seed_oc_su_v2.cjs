/**
 * Seed SKUs for Oxford Cashmere (id=150001) and Shaker Unfinished (id=150002)
 * by cloning from Oxford White and Shaker White respectively.
 *
 * Per USCD P&A V6:
 *   - Oxford Cashmere (OC) = same price tier as Oxford White (OW)
 *   - Shaker Unfinished (SU) = same price tier as Shaker White (SW)
 */
const mysql = require('./node_modules/mysql2/promise');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) { console.error('No DATABASE_URL'); process.exit(1); }
  const conn = await mysql.createConnection(dbUrl);

  // Find the source style IDs
  const [owRows] = await conn.query(
    "SELECT id, ourName, styleCode FROM door_styles WHERE styleCode = 'OW' LIMIT 1"
  );
  const [swRows] = await conn.query(
    "SELECT id, ourName, styleCode FROM door_styles WHERE styleCode = 'SW' LIMIT 1"
  );

  if (!owRows.length || !swRows.length) {
    console.error('Could not find Oxford White or Shaker White source styles');
    await conn.end();
    process.exit(1);
  }

  const owId = owRows[0].id;
  const swId = swRows[0].id;
  const ocId = 150001; // Oxford Cashmere
  const suId = 150002; // Shaker Unfinished

  console.log(`Oxford White source: id=${owId} (${owRows[0].ourName})`);
  console.log(`Shaker White source: id=${swId} (${swRows[0].ourName})`);
  console.log(`Oxford Cashmere target: id=${ocId}`);
  console.log(`Shaker Unfinished target: id=${suId}`);

  // Check if SKUs already exist for OC and SU
  const [existOC] = await conn.query('SELECT COUNT(*) as cnt FROM distributor_skus WHERE styleId = ?', [ocId]);
  const [existSU] = await conn.query('SELECT COUNT(*) as cnt FROM distributor_skus WHERE styleId = ?', [suId]);
  console.log(`Existing OC SKUs: ${existOC[0].cnt}, SU SKUs: ${existSU[0].cnt}`);

  if (existOC[0].cnt > 0 && existSU[0].cnt > 0) {
    console.log('Both already have SKUs. Nothing to do.');
    await conn.end();
    return;
  }

  // Get all columns from distributor_skus
  const [colRows] = await conn.query('SHOW COLUMNS FROM distributor_skus');
  const allCols = colRows.map(c => c.Field);
  console.log('Columns:', allCols.join(', '));

  // Clone Oxford White SKUs -> Oxford Cashmere
  if (existOC[0].cnt === 0) {
    const [owSkus] = await conn.query('SELECT * FROM distributor_skus WHERE styleId = ?', [owId]);
    console.log(`Cloning ${owSkus.length} SKUs from Oxford White to Oxford Cashmere...`);

    let inserted = 0;
    for (const sku of owSkus) {
      // Build new SKU row - remove id (auto-increment), change styleId
      const newSku = { ...sku };
      delete newSku.id;
      newSku.styleId = ocId;

      const cols = Object.keys(newSku);
      const vals = Object.values(newSku);
      const placeholders = cols.map(() => '?').join(', ');
      const colList = cols.map(c => `\`${c}\``).join(', ');

      await conn.query(
        `INSERT INTO distributor_skus (${colList}) VALUES (${placeholders})`,
        vals
      );
      inserted++;
    }
    console.log(`Inserted ${inserted} Oxford Cashmere SKUs`);
  }

  // Clone Shaker White SKUs -> Shaker Unfinished
  if (existSU[0].cnt === 0) {
    const [swSkus] = await conn.query('SELECT * FROM distributor_skus WHERE styleId = ?', [swId]);
    console.log(`Cloning ${swSkus.length} SKUs from Shaker White to Shaker Unfinished...`);

    let inserted = 0;
    for (const sku of swSkus) {
      const newSku = { ...sku };
      delete newSku.id;
      newSku.styleId = suId;

      const cols = Object.keys(newSku);
      const vals = Object.values(newSku);
      const placeholders = cols.map(() => '?').join(', ');
      const colList = cols.map(c => `\`${c}\``).join(', ');

      await conn.query(
        `INSERT INTO distributor_skus (${colList}) VALUES (${placeholders})`,
        vals
      );
      inserted++;
    }
    console.log(`Inserted ${inserted} Shaker Unfinished SKUs`);
  }

  // Verify
  const [finalOC] = await conn.query('SELECT COUNT(*) as cnt FROM distributor_skus WHERE styleId = ?', [ocId]);
  const [finalSU] = await conn.query('SELECT COUNT(*) as cnt FROM distributor_skus WHERE styleId = ?', [suId]);
  console.log(`Final OC SKU count: ${finalOC[0].cnt}`);
  console.log(`Final SU SKU count: ${finalSU[0].cnt}`);

  await conn.end();
  console.log('Done!');
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
