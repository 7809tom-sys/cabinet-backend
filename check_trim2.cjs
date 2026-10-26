const mysql = require('mysql2/promise');

async function run() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  // Check specific items that appear in the base list but have trim categories
  const [rows] = await conn.query(`
    SELECT c.masterCode, c.category, c.subCategory, c.description, c.placementType, c.width, c.height
    FROM cabinets c
    WHERE c.masterCode IN ('FBMS', 'SQDL', 'SHM8', 'SM-8', 'FOL630', 'FOL636', 'FOL642', 'ALRM', 'OCM', 'SprayPaint', 'REPVKIT', 'Sample Door', 'Sample Door Bag')
    ORDER BY c.masterCode
  `);
  
  for (const r of rows) {
    console.log(`${r.masterCode}: cat="${r.category}" sub="${r.subCategory}" pt="${r.placementType}" desc="${r.description}"`);
  }

  await conn.end();
}
run().catch(console.error);
