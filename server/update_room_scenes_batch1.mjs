import mysql from 'mysql2/promise';

// Map: style name -> storage URL (from uploads above)
// Using ourName as key since some styleCodes are shared across distributors
const updates = [
  // Batch 1 (gray/green/navy)
  { name: 'Double Smokey Gray',  url: '/manus-storage/style_DSG_room_scene_894e4b83.jpg' },
  { name: 'Ivy Core',            url: '/manus-storage/style_SI_room_scene_1a9ec745.jpg' },
  { name: 'Navy Core',           url: '/manus-storage/style_SN_room_scene_ca2284d4.jpg' },
  { name: 'Slate Core',          url: '/manus-storage/style_SG_room_scene_224ba678.jpg' },
  { name: 'Slate Echo',          url: '/manus-storage/style_NG_room_scene_9659ff99.jpg' },
  // Batch 2 (wood/taupe/ember/cream/gold)
  { name: 'Essence Oak',         url: '/manus-storage/style_SEO_room_scene_c31fb886.jpg' },
  { name: 'Haven Dune',          url: '/manus-storage/style_HD_room_scene_8face0df.jpg' },
  { name: 'Haven Ember',         url: '/manus-storage/style_HE_room_scene_4cbd37a2.jpg' },
  { name: 'Aura Cream',          url: '/manus-storage/style_CC_room_scene_009e2971.jpg' },
  { name: 'Treasure Chest',      url: '/manus-storage/style_TC_room_scene_ca81360b.jpg' },
  { name: 'Aurum Vault',         url: '/manus-storage/style_TC_room_scene_ca81360b.jpg' },
  // Batch 3 (black/navy/espresso/honey/white)
  { name: 'Iron Black',          url: '/manus-storage/style_IB_room_scene_b32bb193.jpg' },
  { name: 'Navy Blue',           url: '/manus-storage/style_NB_room_scene_7f8eab7f.jpg' },
  { name: 'Shaker Expresso',     url: '/manus-storage/style_SE_room_scene_ff5d8061.jpg' },
  { name: 'Honey Core',          url: '/manus-storage/style_SH_room_scene_f3de607f.jpg' },
  { name: 'Shaker White',        url: '/manus-storage/style_SW3_room_scene_601a7987.jpg' },
];

const conn = await mysql.createConnection(process.env.DATABASE_URL);
let updated = 0;
for (const { name, url } of updates) {
  const [result] = await conn.execute(
    'UPDATE door_styles SET roomSceneImageUrl = ? WHERE ourName = ?',
    [url, name]
  );
  if (result.affectedRows > 0) {
    console.log(`✓ Updated ${name} -> ${url}`);
    updated += result.affectedRows;
  } else {
    console.log(`✗ Not found: ${name}`);
  }
}
console.log(`\nTotal updated: ${updated}`);
await conn.end();
process.exit(0);
