import mysql from 'mysql2/promise';
import fs from 'fs';

const DATABASE_URL = fs.readFileSync('/tmp/dburl.txt', 'utf8').trim().replace(/^DATABASE_URL=/, '');
const conn = await mysql.createConnection(DATABASE_URL);

// skin/panel cabinet ids
const [skins] = await conn.query(
  `SELECT id, masterCode, description, subCategory, width, height, depth, placementType
   FROM cabinets WHERE subCategory LIKE '%Skin%' ORDER BY masterCode`
);
const ids = skins.map(s => s.id);
console.log('Skin products (Skin Panel subcat):', skins.map(s=>s.masterCode).join(', '));

// for each skin, list its SKUs per style
const [skus] = await conn.query(
  `SELECT ds.cabinetId, ds.distributorId, ds.styleId, st.styleCode, st.ourName, st.distributorName,
          ds.platformSku, ds.distributorSku, ds.listPrice, ds.yourCost, ds.isAvailable, ds.isPublished
   FROM distributor_skus ds
   JOIN door_styles st ON st.id = ds.styleId
   WHERE ds.cabinetId IN (${ids.join(',')})
   ORDER BY ds.cabinetId, ds.styleId`
);

const byCab = {};
for (const r of skus) {
  (byCab[r.cabinetId] ??= []).push(r);
}
for (const s of skins) {
  const list = byCab[s.id] || [];
  console.log(`\n### ${s.masterCode} (id ${s.id}) — ${s.subCategory} ${s.width}x${s.height} place=${s.placementType} — ${list.length} SKUs`);
  for (const r of list) {
    console.log(`   dist${r.distributorId} style${r.styleId}/${r.styleCode}=${r.ourName} | ${r.platformSku} | list ${r.listPrice} cost ${r.yourCost} | avail=${r.isAvailable} pub=${r.isPublished}`);
  }
}

await conn.end();
