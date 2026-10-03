const mysql = require("/home/ubuntu/cabinet-dealz/node_modules/mysql2/promise");
(async () => {
  const c = await mysql.createConnection(process.env.DATABASE_URL);
  const q = async (title, s) => { const [r] = await c.query(s); console.log("\n## " + title); console.table(r); return r; };
  await q("BT9 family cabinets", `SELECT c.id,c.masterCode,c.description,c.category,c.subCategory,c.width,c.height,c.depth,c.numberOfDrawers,c.isActive,c.conflictStatus,c.altSku1,c.altSku2,c.altSku3,
    (SELECT GROUP_CONCAT(DISTINCT d.name) FROM distributor_skus ds JOIN distributors d ON d.id=ds.distributorId WHERE ds.cabinetId=c.id AND ds.isPublished=1 AND ds.isAvailable=1) lineNames
    FROM cabinets c WHERE UPPER(REPLACE(REPLACE(c.masterCode,'-',''),' ','')) IN ('BT9','BT09','FHBO9','TBO9','B9','B09','FHB9','FHBO09','TBO09') ORDER BY c.masterCode`);
  await q("BT9 family alias rows", `SELECT * FROM sku_master_aliases WHERE UPPER(REPLACE(REPLACE(aliasCode,'-',''),' ','')) IN ('BT9','BT09','FHBO9','TBO9','B9','B09') OR UPPER(REPLACE(REPLACE(masterCode,'-',''),' ','')) IN ('BT9','BT09','FHBO9','TBO9','B9','B09')`);
  await q("BT9 family cabinet_aliases", `SELECT ca.alias, c.masterCode FROM cabinet_aliases ca JOIN cabinets c ON c.id=ca.cabinetId WHERE UPPER(REPLACE(REPLACE(ca.alias,'-',''),' ','')) IN ('BT9','BT09','FHBO9','TBO9','B9','B09') OR UPPER(REPLACE(REPLACE(c.masterCode,'-',''),' ','')) IN ('BT9','BT09','FHBO9','TBO9','B9','B09')`);
  await q("Distributor SKU codes in BT9 family", `SELECT d.name, ds.distributorSku, c.masterCode, COUNT(*) n FROM distributor_skus ds JOIN cabinets c ON c.id=ds.cabinetId JOIN distributors d ON d.id=ds.distributorId WHERE UPPER(REPLACE(REPLACE(ds.distributorSku,'-',''),' ','')) IN ('BT9','BT09','FHBO9','TBO9','B9','B09') GROUP BY d.name, ds.distributorSku, c.masterCode`);
  // Full alias report: every group (master + aliases) with lines per code
  const groups = await q("Alias groups summary (sku_master_aliases, ok only)", `SELECT a.masterCode, GROUP_CONCAT(a.aliasCode ORDER BY a.aliasCode SEPARATOR ' | ') aliases, COUNT(*) n,
     (SELECT GROUP_CONCAT(DISTINCT d.name) FROM distributor_skus ds JOIN cabinets c2 ON c2.id=ds.cabinetId JOIN distributors d ON d.id=ds.distributorId WHERE c2.masterCode=a.masterCode AND ds.isPublished=1 AND ds.isAvailable=1) masterLines,
     EXISTS(SELECT 1 FROM cabinets c3 WHERE c3.masterCode=a.masterCode) masterExists
     FROM sku_master_aliases a WHERE a.conflictStatus='ok' AND a.aliasCode<>a.masterCode GROUP BY a.masterCode ORDER BY a.masterCode`);
  console.log("groups:", groups.length);
  await q("Alias rows whose master code has no cabinet row (unassignable)", `SELECT a.aliasCode,a.masterCode FROM sku_master_aliases a WHERE a.conflictStatus='ok' AND NOT EXISTS(SELECT 1 FROM cabinets c WHERE c.masterCode=a.masterCode)`);
  await q("Conflict alias rows", `SELECT * FROM sku_master_aliases WHERE conflictStatus<>'ok'`);
  await q("Chains: alias whose master is itself an alias", `SELECT a.aliasCode,a.masterCode,b.masterCode nextMaster FROM sku_master_aliases a JOIN sku_master_aliases b ON b.aliasCode=a.masterCode AND b.masterCode<>a.masterCode WHERE a.conflictStatus='ok'`);
  await c.end();
})().catch((e) => { console.error(e); process.exit(1); });
