/**
 * fix-cdb36-skus.mjs
 * Copies distributor SKU rows from a well-covered template cabinet to CDB-36
 * for every style that CDB-36 is currently missing.
 */
import { createConnection } from "mysql2/promise";

const conn = await createConnection(process.env.DATABASE_URL);

try {
  // 1. Find CDB-36's cabinet ID
  const [[cdb36]] = await conn.execute(
    'SELECT id, masterCode FROM cabinets WHERE masterCode = "CDB-36" LIMIT 1'
  );
  if (!cdb36) { console.error("CDB-36 not found"); process.exit(1); }
  console.log(`CDB-36 id: ${cdb36.id}`);

  // 2. Find a template cabinet that has the most SKU coverage
  //    (pick the cabinet with the highest number of published+available SKUs)
  const [templateRows] = await conn.execute(`
    SELECT c.id, c.masterCode, COUNT(*) as cnt
    FROM distributor_skus ds
    JOIN cabinets c ON c.id = ds.cabinetId
    WHERE ds.isAvailable = 1 AND ds.isPublished = 1
      AND c.isActive = 1 AND c.masterCode != "CDB-36"
      AND c.category = "Base"
    GROUP BY c.id, c.masterCode
    ORDER BY cnt DESC
    LIMIT 1
  `);
  const template = templateRows[0];
  if (!template) { console.error("No template found"); process.exit(1); }
  console.log(`Template: ${template.masterCode} (id=${template.id}, ${template.cnt} SKUs)`);

  // 3. Get all template SKUs
  const [templateSkus] = await conn.execute(
    'SELECT * FROM distributor_skus WHERE cabinetId = ?',
    [template.id]
  );
  console.log(`Template SKUs: ${templateSkus.length}`);

  // 4. Get existing CDB-36 SKUs to avoid duplicates
  const [existingSkus] = await conn.execute(
    'SELECT distributorId, styleId FROM distributor_skus WHERE cabinetId = ?',
    [cdb36.id]
  );
  const existingKeys = new Set(existingSkus.map(s => `${s.distributorId}:${s.styleId}`));
  console.log(`CDB-36 already has ${existingSkus.length} SKUs`);

  // 5. Build rows to insert (only missing combos)
  const toInsert = templateSkus
    .filter(t => !existingKeys.has(`${t.distributorId}:${t.styleId}`))
    .map(t => ({
      cabinetId: cdb36.id,
      distributorId: t.distributorId,
      styleId: t.styleId,
      distributorSku: `CDB-36-${t.styleId}`,
      platformSku: `CDB-36-${t.styleId}`,
      wholesalePrice: t.wholesalePrice,
      contractorPrice: t.contractorPrice,
      homeownerPrice: t.homeownerPrice,
      isAvailable: t.isAvailable,
      isPublished: t.isPublished,
    }));

  console.log(`Inserting ${toInsert.length} new SKU rows for CDB-36...`);

  if (toInsert.length === 0) {
    console.log("Nothing to insert — CDB-36 already has full coverage.");
  } else {
    // Insert in batches of 50
    const batchSize = 50;
    let inserted = 0;
    for (let i = 0; i < toInsert.length; i += batchSize) {
      const batch = toInsert.slice(i, i + batchSize);
      const placeholders = batch.map(() => "(?,?,?,?,?,?,?,?,?,?)").join(",");
      const values = batch.flatMap(r => [
        r.cabinetId, r.distributorId, r.styleId,
        r.distributorSku, r.platformSku,
        r.wholesalePrice, r.contractorPrice, r.homeownerPrice,
        r.isAvailable ? 1 : 0, r.isPublished ? 1 : 0,
      ]);
      await conn.execute(
        `INSERT INTO distributor_skus
           (cabinetId, distributorId, styleId, distributorSku, platformSku,
            wholesalePrice, contractorPrice, homeownerPrice, isAvailable, isPublished)
         VALUES ${placeholders}`,
        values
      );
      inserted += batch.length;
    }
    console.log(`Done! Inserted ${inserted} SKU rows.`);
  }

  // 6. Verify final count
  const [[final]] = await conn.execute(
    'SELECT COUNT(*) as cnt FROM distributor_skus WHERE cabinetId = ? AND isAvailable = 1 AND isPublished = 1',
    [cdb36.id]
  );
  console.log(`CDB-36 now has ${final.cnt} published+available SKUs.`);

} finally {
  await conn.end();
}
