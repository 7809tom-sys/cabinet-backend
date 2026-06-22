import 'dotenv/config';
import mysql from 'mysql2/promise';
import fs from 'fs';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
function toCsv(rows, cols) {
  const head = cols.map((c) => csvCell(c.header)).join(',');
  const body = rows
    .map((r) => cols.map((c) => csvCell(r[c.key])).join(','))
    .join('\n');
  return head + '\n' + body + '\n';
}

// ── 1. DOOR STYLES (families) — this is where the room scene + door photo live ──
const [styles] = await conn.query(
  `SELECT id, styleCode, ourName, doorStyle, woodSpecies, finish, color,
          roomSceneImageUrl, doorSampleImageUrl, thumbnailImageUrl, isActive
     FROM door_styles ORDER BY ourName`
);
const styleCols = [
  { key: 'id', header: 'id (do not edit)' },
  { key: 'ourName', header: 'family_name' },
  { key: 'styleCode', header: 'style_code' },
  { key: 'doorStyle', header: 'door_style' },
  { key: 'woodSpecies', header: 'wood' },
  { key: 'finish', header: 'finish' },
  { key: 'color', header: 'color' },
  { key: 'roomSceneImageUrl', header: 'room_scene_image_url' },
  { key: 'doorSampleImageUrl', header: 'door_image_url' },
  { key: 'thumbnailImageUrl', header: 'thumbnail_image_url' },
  { key: 'isActive', header: 'active(1/0)' },
];
fs.writeFileSync(
  '/home/ubuntu/cabinet-dealz/exports/door_style_families.csv',
  toCsv(styles, styleCols)
);

// ── 2. CABINET PRODUCTS — every product/cabinet ───────────────────────────────
const [cabs] = await conn.query(
  `SELECT id, masterCode, description, category, subCategory,
          width, height, depth, numberOfDoors, numberOfDrawers, isActive
     FROM cabinets ORDER BY category, masterCode`
);
const cabCols = [
  { key: 'id', header: 'id (do not edit)' },
  { key: 'masterCode', header: 'product_code' },
  { key: 'description', header: 'product_name' },
  { key: 'category', header: 'category' },
  { key: 'subCategory', header: 'type' },
  { key: 'width', header: 'width_in' },
  { key: 'height', header: 'height_in' },
  { key: 'depth', header: 'depth_in' },
  { key: 'numberOfDoors', header: 'doors' },
  { key: 'numberOfDrawers', header: 'drawers' },
  { key: 'isActive', header: 'active(1/0)' },
];
fs.writeFileSync(
  '/home/ubuntu/cabinet-dealz/exports/cabinet_products.csv',
  toCsv(cabs, cabCols)
);

console.log('Door style families:', styles.length);
console.log('Cabinet products:', cabs.length);
await conn.end();
