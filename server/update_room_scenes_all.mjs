import mysql from 'mysql2/promise';

// All updates keyed by ourName (unique per distributor+style combo)
const updates = [
  // Batch 2
  { name: 'Aspen Charcoal Gray',   url: '/manus-storage/style_AC_room_scene_75d2f390.jpg' },
  { name: 'Aspen White',           url: '/manus-storage/style_AW_room_scene_a0c013d7.jpg' },
  { name: 'Aston Green',           url: '/manus-storage/style_AG_room_scene_610d61cf.jpg' },
  { name: 'Crystal Glass',         url: '/manus-storage/style_CG_room_scene_d7553169.jpg' },
  { name: 'Casselberry Saddle',    url: '/manus-storage/style_CS_room_scene_8fbb3f96.jpg' },
  { name: 'Casselberry White',     url: '/manus-storage/style_CW_saddle_room_scene_6ef0a70e.jpg' },
  { name: 'Charleston White',      url: '/manus-storage/style_CW2_room_scene_f8d22f9d.jpg' },
  { name: 'Double Dove White',     url: '/manus-storage/style_DDW_room_scene_4aaa59d2.jpg' },
  { name: 'Edge White',            url: '/manus-storage/style_EW_room_scene_aef93341.jpg' },
  { name: 'Floral Espresso',       url: '/manus-storage/style_FE_room_scene_1acf51da.jpg' },
  // Batch 3
  { name: 'Floral Grey',           url: '/manus-storage/style_FG_room_scene_633fb801.jpg' },
  { name: 'High Gloss Gray',       url: '/manus-storage/style_HG_room_scene_3d3e4f5c.jpg' },
  { name: 'High Gloss White',      url: '/manus-storage/style_HW_room_scene_51221a95.jpg' },
  { name: 'Silva Shaker',          url: '/manus-storage/style_HS_room_scene_b4a228ab.jpg' },
  { name: 'Lunar Gray',            url: '/manus-storage/style_LG_room_scene_ac39c3f1.jpg' },
  { name: 'Matte Black',           url: '/manus-storage/style_MB_room_scene_0b0874a8.jpg' },
  { name: 'Matte Gray',            url: '/manus-storage/style_MG_room_scene_ebdf1c63.jpg' },
  { name: 'Midnight Glass',        url: '/manus-storage/style_MI_room_scene_b7eba457.jpg' },
  { name: 'Matte Ivory',           url: '/manus-storage/style_MI2_room_scene_c62867cf.jpg' },
  { name: 'Onyx Shadow',           url: '/manus-storage/style_MBS_room_scene_0666d4be.jpg' },
  // Batch 4
  { name: 'Oxford Blue',           url: '/manus-storage/style_OB_room_scene_fe5fe1c9.jpg' },
  { name: 'Oak Blonde',            url: '/manus-storage/style_OB2_room_scene_53bee08c.jpg' },
  { name: 'Oxford Cashmere',       url: '/manus-storage/style_OC_room_scene_b68baaa0.jpg' },
  { name: 'Oxford Mist',           url: '/manus-storage/style_OM_room_scene_2e216789.jpg' },
  { name: 'Oxford Sage',           url: '/manus-storage/style_OS_room_scene_30c6266b.jpg' },
  { name: 'Oak Shade',             url: '/manus-storage/style_OS2_room_scene_9de7ecb2.jpg' },
  { name: 'Oxford Toffee',         url: '/manus-storage/style_OT_room_scene_08aca9a2.jpg' },
  { name: 'Oxford White',          url: '/manus-storage/style_OW_room_scene_ed91a27a.jpg' },
  { name: 'Sterling Pulse',        url: '/manus-storage/style_PS_room_scene_df2ad79e.jpg' },
  { name: 'Forest Rust',           url: '/manus-storage/style_RH_room_scene_c7c49349.jpg' },
  // Batch 5
  { name: 'Smokey Ash',            url: '/manus-storage/style_SA_room_scene_74694e73.jpg' },
  { name: 'Aura White',            url: '/manus-storage/style_SA2_room_scene_19a3587c.jpg' },
  { name: 'Slim Amber Oak',        url: '/manus-storage/style_SAO_room_scene_ddb6ada6.jpg' },
  { name: 'Onyx Core',             url: '/manus-storage/style_SB_room_scene_dc150918.jpg' },
  { name: 'Nimbus White',          url: '/manus-storage/style_SD_room_scene_8346fcb9.jpg' },
  { name: 'Slim Iron Black',       url: '/manus-storage/style_SIB_room_scene_1d9711a6.jpg' },
  { name: 'Shaker Unfinished',     url: '/manus-storage/style_SU_room_scene_eaec2d29.jpg' },
  { name: 'Nova White',            url: '/manus-storage/style_SW_nova_room_scene_4927df87.jpg' },
  { name: 'Nimbus Grey',           url: '/manus-storage/style_WPG_room_scene_6aa11519.jpg' },
];

const conn = await mysql.createConnection(process.env.DATABASE_URL);
let updated = 0;
let notFound = 0;

for (const { name, url } of updates) {
  const [result] = await conn.execute(
    'UPDATE door_styles SET roomSceneImageUrl = ? WHERE ourName = ?',
    [url, name]
  );
  if (result.affectedRows > 0) {
    console.log(`✓ ${name} (${result.affectedRows} row${result.affectedRows > 1 ? 's' : ''})`);
    updated += result.affectedRows;
  } else {
    console.log(`✗ Not found: ${name}`);
    notFound++;
  }
}

// Nova White appears twice (SW and WS style codes) - update the WS one separately
const [wsResult] = await conn.execute(
  `UPDATE door_styles SET roomSceneImageUrl = ? WHERE ourName = 'Nova White' AND styleCode = 'WS'`,
  ['/manus-storage/style_WS_room_scene_d6f552cc.jpg']
);
if (wsResult.affectedRows > 0) {
  console.log(`✓ Nova White (WS) updated separately`);
  updated += wsResult.affectedRows;
}

console.log(`\nTotal rows updated: ${updated} | Not found: ${notFound}`);
await conn.end();
process.exit(0);
