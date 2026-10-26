const mysql = require("/home/ubuntu/cabinet-dealz/node_modules/mysql2/promise");
(async () => {
  const c = await mysql.createConnection(process.env.DATABASE_URL);
  // 1. Alias rows where BOTH sides are real priced masters (one-direction links between live products)
  const [oneWay] = await c.query(`
    SELECT a.aliasCode, a.masterCode,
      (SELECT GROUP_CONCAT(DISTINCT d.name) FROM distributor_skus ds JOIN cabinets c2 ON c2.id=ds.cabinetId JOIN distributors d ON d.id=ds.distributorId WHERE c2.masterCode=a.aliasCode AND ds.isPublished=1 AND ds.isAvailable=1) aliasLines,
      (SELECT GROUP_CONCAT(DISTINCT d.name) FROM distributor_skus ds JOIN cabinets c2 ON c2.id=ds.cabinetId JOIN distributors d ON d.id=ds.distributorId WHERE c2.masterCode=a.masterCode AND ds.isPublished=1 AND ds.isAvailable=1) masterLines,
      EXISTS(SELECT 1 FROM sku_master_aliases r WHERE r.aliasCode=a.masterCode AND r.masterCode=a.aliasCode) hasReverse
    FROM sku_master_aliases a WHERE a.conflictStatus='ok' AND a.aliasCode<>a.masterCode
    HAVING aliasLines IS NOT NULL AND masterLines IS NOT NULL`);
  console.log("\n## sku_master_aliases rows linking two LIVE priced masters (only alias->master direction works)");
  console.table(oneWay);
  // 2. altSku columns pointing at another live master code, with no alias row in either direction
  const [alt] = await c.query(`
    SELECT c.masterCode, alt.code altCode,
      (SELECT GROUP_CONCAT(DISTINCT d.name) FROM distributor_skus ds JOIN distributors d ON d.id=ds.distributorId WHERE ds.cabinetId=c.id AND ds.isPublished=1 AND ds.isAvailable=1) ownLines,
      (SELECT GROUP_CONCAT(DISTINCT d.name) FROM distributor_skus ds JOIN cabinets c2 ON c2.id=ds.cabinetId JOIN distributors d ON d.id=ds.distributorId WHERE c2.masterCode=alt.code AND ds.isPublished=1 AND ds.isAvailable=1) altLines,
      EXISTS(SELECT 1 FROM sku_master_aliases r WHERE (r.aliasCode=alt.code AND r.masterCode=c.masterCode) OR (r.aliasCode=c.masterCode AND r.masterCode=alt.code)) aliasRow
    FROM cabinets c
    JOIN (SELECT id, altSku1 code FROM cabinets UNION ALL SELECT id, altSku2 FROM cabinets UNION ALL SELECT id, altSku3 FROM cabinets) alt ON alt.id=c.id
    WHERE alt.code IS NOT NULL AND alt.code<>'' AND alt.code<>c.masterCode AND EXISTS(SELECT 1 FROM cabinets x WHERE x.masterCode=alt.code)
    ORDER BY c.masterCode`);
  console.log("\n## altSku1-3 pointing at ANOTHER live master code (altSku is never read by pricing)");
  console.table(alt);
  // 3. Same physical cabinet (placement, dims, corner flag, door/drawer counts) sold under DIFFERENT codes on different lines, no alias row either direction
  const [twins] = await c.query(`
    SELECT a.masterCode codeA, GROUP_CONCAT(DISTINCT da.name) linesA, b.masterCode codeB, GROUP_CONCAT(DISTINCT db.name) linesB,
           a.category, a.subCategory subA, b.subCategory subB, a.width, a.height, a.depth
    FROM cabinets a JOIN cabinets b ON a.id<b.id
      AND a.masterCode<>b.masterCode
      AND UPPER(REPLACE(REPLACE(a.masterCode,'-',''),' ',''))<>UPPER(REPLACE(REPLACE(b.masterCode,'-',''),' ',''))
      AND a.width=b.width AND a.height=b.height AND a.depth=b.depth
      AND COALESCE(a.placementType,'')=COALESCE(b.placementType,'')
      AND COALESCE(a.isCornerCabinet,0)=COALESCE(b.isCornerCabinet,0)
      AND COALESCE(a.numberOfDoors,-1)=COALESCE(b.numberOfDoors,-1) AND COALESCE(a.numberOfDrawers,-1)=COALESCE(b.numberOfDrawers,-1)
      AND (LOWER(CONCAT(a.subCategory,' ',a.description)) REGEXP 'corner|lazy|easy|blind|susan') AND (LOWER(CONCAT(b.subCategory,' ',b.description)) REGEXP 'corner|lazy|easy|blind|susan')
    JOIN distributor_skus sa ON sa.cabinetId=a.id AND sa.isPublished=1 AND sa.isAvailable=1 JOIN distributors da ON da.id=sa.distributorId
    JOIN distributor_skus sb ON sb.cabinetId=b.id AND sb.isPublished=1 AND sb.isAvailable=1 JOIN distributors db ON db.id=sb.distributorId
    WHERE NOT EXISTS (SELECT 1 FROM sku_master_aliases r WHERE (r.aliasCode=a.masterCode AND r.masterCode=b.masterCode) OR (r.aliasCode=b.masterCode AND r.masterCode=a.masterCode))
    GROUP BY a.id,b.id ORDER BY a.masterCode`);
  console.log("\n## CORNER-family twins: same dims/placement, different codes, no alias row either direction");
  console.table(twins);
  // 4. Dash/space variants that resolve only via normalization inside cabinet_aliases (where there IS a cabinet_aliases row)
  const [dash] = await c.query(`
    SELECT a.masterCode codeA, b.masterCode codeB,
      (SELECT GROUP_CONCAT(DISTINCT d.name) FROM distributor_skus ds JOIN distributors d ON d.id=ds.distributorId WHERE ds.cabinetId=a.id AND ds.isPublished=1) linesA,
      (SELECT GROUP_CONCAT(DISTINCT d.name) FROM distributor_skus ds JOIN distributors d ON d.id=ds.distributorId WHERE ds.cabinetId=b.id AND ds.isPublished=1) linesB,
      EXISTS(SELECT 1 FROM sku_master_aliases r WHERE (r.aliasCode=a.masterCode AND r.masterCode=b.masterCode) OR (r.aliasCode=b.masterCode AND r.masterCode=a.masterCode)) aliasRow
    FROM cabinets a JOIN cabinets b ON a.id<b.id AND a.masterCode<>b.masterCode
      AND UPPER(REPLACE(REPLACE(REPLACE(a.masterCode,'-',''),' ',''),'_',''))=UPPER(REPLACE(REPLACE(REPLACE(b.masterCode,'-',''),' ',''),'_',''))
    ORDER BY a.masterCode`);
  console.log("\n## Punctuation-only twins (same code once dashes/spaces removed)");
  console.table(dash);
  await c.end();
})().catch((e) => { console.error(e); process.exit(1); });
