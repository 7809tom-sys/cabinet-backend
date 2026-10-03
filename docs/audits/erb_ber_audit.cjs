const mysql = require("/home/ubuntu/cabinet-dealz/node_modules/mysql2/promise");
(async () => {
  const c = await mysql.createConnection(process.env.DATABASE_URL);
  const q = async (s, p = []) => { const [r] = await c.query(s, p); console.log("\n## " + s.replace(/\s+/g, " ").slice(0, 160)); console.table(r); };
  await q("SELECT id,masterCode,altSku1,altSku2,altSku3,isActive,showInDesigner,conflictStatus,category FROM cabinets WHERE masterCode REGEXP '^(ERB|BER)' ORDER BY masterCode");
  await q("SELECT * FROM sku_master_aliases WHERE aliasCode REGEXP '^(ERB|BER)' OR masterCode REGEXP '^(ERB|BER)'");
  await q("SELECT ca.alias, ca.cabinetId, c.masterCode FROM cabinet_aliases ca JOIN cabinets c ON c.id=ca.cabinetId WHERE ca.alias REGEXP '^(ERB|BER)' OR c.masterCode REGEXP '^(ERB|BER)'");
  await q("SELECT d.id dist,d.name,c.masterCode,MIN(ds.distributorSku) sku,COUNT(*) n,SUM(ds.isAvailable AND ds.isPublished AND (COALESCE(ds.listPrice,0)>0 OR COALESCE(ds.yourCost,0)>0)) priced FROM distributor_skus ds JOIN cabinets c ON c.id=ds.cabinetId JOIN distributors d ON d.id=ds.distributorId WHERE c.masterCode REGEXP '^(ERB|BER)' GROUP BY d.id,c.masterCode ORDER BY d.id,c.masterCode");
  await q("SELECT d.id dist,d.name,ds.distributorSku,c.masterCode,COUNT(*) n FROM distributor_skus ds JOIN cabinets c ON c.id=ds.cabinetId JOIN distributors d ON d.id=ds.distributorId WHERE ds.distributorSku REGEXP '^(ERB|BER)' GROUP BY d.id,ds.distributorSku,c.masterCode ORDER BY d.id");
  await q("SELECT COUNT(*) total, SUM(conflictStatus='ok') ok FROM sku_master_aliases");
  await q("SELECT COUNT(*) total FROM cabinet_aliases");
  await q("SELECT COUNT(*) withAlt FROM cabinets WHERE COALESCE(altSku1,'')<>'' OR COALESCE(altSku2,'')<>'' OR COALESCE(altSku3,'')<>''");
  await c.end();
})().catch((e) => { console.error(e); process.exit(1); });
