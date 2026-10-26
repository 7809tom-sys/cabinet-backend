const mysql = require('./node_modules/mysql2/promise');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  // Replicate the availableStyleIds query for OC and SU
  const [rows] = await conn.query(`
    SELECT DISTINCT ds.styleId
    FROM distributor_skus ds
    INNER JOIN cabinets c ON c.id = ds.cabinetId
    WHERE ds.isPublished = 1
      AND ds.isAvailable = 1
      AND c.isActive = 1
      AND c.showInDesigner = 1
      AND c.conflictStatus != 'conflict'
      AND ds.styleId IN (150001, 150002)
  `);
  console.log('Styles passing filter:', JSON.stringify(rows));

  // Check how many cabinets are linked and their status
  const [cabRows] = await conn.query(`
    SELECT ds.styleId, COUNT(DISTINCT c.id) as totalCabs,
           SUM(c.isActive) as activeCabs,
           SUM(c.showInDesigner) as designerCabs,
           SUM(CASE WHEN c.conflictStatus = 'conflict' THEN 1 ELSE 0 END) as conflictCabs
    FROM distributor_skus ds
    INNER JOIN cabinets c ON c.id = ds.cabinetId
    WHERE ds.styleId IN (150001, 150002)
    GROUP BY ds.styleId
  `);
  console.log('Cabinet status per style:', JSON.stringify(cabRows, null, 2));

  await conn.end();
}
main().catch(e => console.error(e.message));
