import 'dotenv/config';
import mysql from 'mysql2/promise';

const DRY = process.argv.includes('--dry');

// styleCode -> storage path for the new swatch (both sample + thumbnail get it)
const imgByCode = {
  ASP: '/manus-storage/door-aspen-white-clarkson-v2_ff1cc8e0.png',
  HS:  '/manus-storage/door-hickory-shaker-v2_d5a681ba.png',
  PS:  '/manus-storage/door-platinum-shaker-v2_7b6c0d0b.png',
  WPG: '/manus-storage/door-west-point-grey-v2_50b1da02.png',
  WS:  '/manus-storage/door-white-shaker-cs-v2_bf53cd57.png',
  NG:  '/manus-storage/door-winchester-grey-v2_f451e197.png',
  MBS: '/manus-storage/door-midnight-black-v2_30fa7eb1.png',
  RH:  '/manus-storage/door-rustic-hickory-v2_1db7dcb3.png',
  CS:  '/manus-storage/door-carmel-shaker-v2_1602ea08.png',
  FS:  '/manus-storage/door-fresh-sage-v2_e7b7c8a3.png',
  CC:  '/manus-storage/door-classic-cream-v2_ce7d40dd.png',
  DN:  '/manus-storage/door-designer-natural-v2_d6c29a98.png',
  GV:  '/manus-storage/door-greek-villa-v2_e7395134.png',
};

const conn = await mysql.createConnection(process.env.DATABASE_URL);
await conn.beginTransaction();
try {
  // 1. Insert GV if missing
  const [gvRows] = await conn.query(
    "SELECT id FROM door_styles WHERE distributorId=2 AND styleCode='GV'");
  if (!gvRows.length) {
    if (!DRY) {
      await conn.query(
        `INSERT INTO door_styles
         (distributorId, styleCode, ourName, aliasName, distributorName, doorStyle,
          woodSpecies, finish, color, overlayType, doorPanelType,
          doorSampleImageUrl, thumbnailImageUrl, doorSampleVerified,
          isBuilderGrade, isActive)
         VALUES (2,'GV','Villa Blanc','Villa Blanc','Greek Villa','Raised Panel',
          'Solid Maple / Birch','Matching','SW 7551 Greek Villa','Full','Engineered HDF',
          ?, ?, 1, 0, 1)`,
        [imgByCode.GV, imgByCode.GV]);
    }
    console.log('GV inserted', DRY ? '(dry)' : '');
  } else {
    console.log('GV already exists id', gvRows[0].id);
  }

  // 2. Assign swatch images to all 13 Clark And Son codes
  let updated = 0, skipped = [];
  for (const [code, path] of Object.entries(imgByCode)) {
    if (code === 'GV') continue; // handled above
    const [rows] = await conn.query(
      'SELECT id FROM door_styles WHERE distributorId=2 AND styleCode=?', [code]);
    if (!rows.length) { skipped.push(code); continue; }
    if (!DRY) {
      await conn.query(
        `UPDATE door_styles
         SET doorSampleImageUrl=?, thumbnailImageUrl=?, doorSampleVerified=1
         WHERE distributorId=2 AND styleCode=?`,
        [path, path, code]);
    }
    updated++;
  }
  console.log('Image assignments:', updated, DRY ? '(dry)' : '');
  if (skipped.length) console.log('Skipped (not found):', skipped.join(', '));

  if (DRY) { await conn.rollback(); console.log('DRY — rolled back'); }
  else { await conn.commit(); console.log('COMMITTED'); }
} catch (e) {
  await conn.rollback();
  console.error('ERROR rolled back:', e.message);
  process.exitCode = 1;
} finally { await conn.end(); }
