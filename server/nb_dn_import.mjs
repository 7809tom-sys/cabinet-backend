import 'dotenv/config';
import fs from 'fs';
import mysql from 'mysql2/promise';

const DRY = process.argv.includes('--dry');
const data = JSON.parse(fs.readFileSync('/home/ubuntu/cabinet-dealz/notes/dn_resolved.json', 'utf8'));
const { resolved, unmatched } = data;

const conn = await mysql.createConnection(process.env.DATABASE_URL);
await conn.beginTransaction();
try {
  // 1) DN door_styles row (idempotent)
  const [existDS] = await conn.query(
    "SELECT id FROM door_styles WHERE distributorId=2 AND styleCode='DN'");
  let styleId;
  if (existDS.length) {
    styleId = existDS[0].id;
    console.log('DN door_styles already exists id=', styleId);
  } else {
    const [mx] = await conn.query('SELECT MAX(id) mx FROM door_styles');
    styleId = (mx[0].mx || 30000) + 1;
    if (!DRY) {
      await conn.query(
        `INSERT INTO door_styles
         (id, distributorId, styleCode, ourName, distributorName, doorStyle, woodSpecies, finish, color, overlayType, isActive, doorSampleVerified, aliasName, alias_name)
         VALUES (?,2,'DN','Natura Maple','Designer Natural','Shaker','Maple','Natural','Designer Natural','Full',1,1,'Designer Natural','Designer Natural')`,
        [styleId]);
    }
    console.log('DN door_styles insert id=', styleId, DRY ? '(dry)' : '');
  }

  // helper: insert a distributor_sku
  async function insertSku({ cabinetId, distributorSku, list, cost, published }) {
    const platformSku = distributorSku; // keep DN-<code> as platform sku for this line
    if (DRY) return;
    await conn.query(
      `INSERT INTO distributor_skus
        (cabinetId, distributorId, styleId, platformSku, distributorSku, listPrice, yourCost, isAvailable, isPublished)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [cabinetId, 2, styleId, platformSku, distributorSku, list, cost, published ? 1 : 1, published ? 1 : 0]);
  }

  // 2) matched SKUs -> published
  let importedMatched = 0;
  for (const r of resolved) {
    await insertSku({ cabinetId: r.cabinetId, distributorSku: r.sku, list: r.list, cost: r.cost, published: true });
    importedMatched++;
  }
  console.log('Imported matched SKUs:', importedMatched, DRY ? '(dry)' : '');

  // 3) unmatched -> create conflict placeholder cabinet, attach unpublished SKU
  let importedConflict = 0;
  for (const u of unmatched) {
    let cabinetId;
    if (!DRY) {
      // placeholder cabinet flagged conflict
      const master = `DN-${u.code}`;
      const [ins] = await conn.query(
        `INSERT INTO cabinets
          (masterCode, description, descriptionSource, category, isActive, conflictStatus, conflictReason, conflictedAt, showInCatalog, showInDesigner)
         VALUES (?,?,?,?,?,?,?,NOW(),?,?)`,
        [master, u.desc || `Designer Natural ${u.code}`, 'Clark And Son sheet (DN)', 'Accessory', 1,
         'conflict', 'DN SKU with no matching master cabinet (DN-only size or accessory) - imported for pricing, needs review', 0, 0]);
      cabinetId = ins.insertId;
    }
    await insertSku({ cabinetId: cabinetId || 0, distributorSku: u.sku, list: u.list, cost: u.cost, published: false });
    importedConflict++;
  }
  console.log('Imported conflict/placeholder SKUs:', importedConflict, DRY ? '(dry)' : '');

  if (DRY) { await conn.rollback(); console.log('DRY RUN — rolled back'); }
  else { await conn.commit(); console.log('COMMITTED'); }
} catch (e) {
  await conn.rollback();
  console.error('ERROR, rolled back:', e.message);
  process.exitCode = 1;
} finally {
  await conn.end();
}
