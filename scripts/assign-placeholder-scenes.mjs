import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

/**
 * Placeholder assignments — closest color/style match from existing scenes:
 *
 * CG  Prism Clear (id=210028) — glass/clear → use Crystal Glass [CG] scene
 *     /manus-storage/style_CG_room_scene_d7553169.jpg
 *
 * CW  Casselberry Antique White (id=30055) — white antique → use Shaker Antique White [SA] scene
 *     /manus-storage/catalog-images/1784124770844_Shaker_Antique_White_2_d8646a05.png
 *
 * DDW Dual Blanc (id=210015) — white double-door → use Double Dove White [DDW] scene (same code, other distributor)
 *     /manus-storage/style_DDW_room_scene_4aaa59d2.jpg
 *
 * LG  Lunar Gray (id=180002) — gray → use Slate Core [SG] scene
 *     /manus-storage/style_SG_room_scene_224ba678.jpg
 *
 * LG  Selene Gray (id=210008) — gray → use Matte Gray [MG] scene
 *     /manus-storage/style_MG_room_scene_ebdf1c63.jpg
 *
 * MG  Nocturne Glass (id=210029) — dark glass → use Midnight Glass [MI] scene
 *     /manus-storage/style_MI_room_scene_b7eba457.jpg
 *
 * SAO Aero Solstice (id=210020) — oak → use Slim Amber Oak [SAO] scene (same code, other distributor)
 *     /manus-storage/style_SAO_room_scene_ddb6ada6.jpg
 *
 * SIB Aero Obsidian (id=210019) — black → use Slim Iron Black [SIB] scene (same code, other distributor)
 *     /manus-storage/style_SIB_room_scene_1d9711a6.jpg
 */

const updates = [
  { id: 210028, scene: '/manus-storage/style_CG_room_scene_d7553169.jpg', note: 'CG Prism Clear → Crystal Glass scene' },
  { id: 30055,  scene: '/manus-storage/catalog-images/1784124770844_Shaker_Antique_White_2_d8646a05.png', note: 'CW Casselberry Antique White → Shaker Antique White scene' },
  { id: 210015, scene: '/manus-storage/style_DDW_room_scene_4aaa59d2.jpg', note: 'DDW Dual Blanc → Double Dove White scene' },
  { id: 180002, scene: '/manus-storage/style_SG_room_scene_224ba678.jpg', note: 'LG Lunar Gray → Slate Core scene' },
  { id: 210008, scene: '/manus-storage/style_MG_room_scene_ebdf1c63.jpg', note: 'LG Selene Gray → Matte Gray scene' },
  { id: 210029, scene: '/manus-storage/style_MI_room_scene_b7eba457.jpg', note: 'MG Nocturne Glass → Midnight Glass scene' },
  { id: 210020, scene: '/manus-storage/style_SAO_room_scene_ddb6ada6.jpg', note: 'SAO Aero Solstice → Slim Amber Oak scene' },
  { id: 210019, scene: '/manus-storage/style_SIB_room_scene_1d9711a6.jpg', note: 'SIB Aero Obsidian → Slim Iron Black scene' },
];

for (const u of updates) {
  const [result] = await conn.execute(
    'UPDATE door_styles SET roomSceneImageUrl = ? WHERE id = ?',
    [u.scene, u.id]
  );
  const changed = result.affectedRows;
  console.log(`${changed > 0 ? '✓' : '✗'} [id=${u.id}] ${u.note}`);
}

// Verify
const [rows] = await conn.execute(
  'SELECT id, styleCode, ourName, roomSceneImageUrl FROM door_styles WHERE id IN (210028, 30055, 210015, 180002, 210008, 210029, 210020, 210019)'
);
console.log('\nVerification:');
for (const r of rows) {
  console.log(`  [${r.styleCode}] ${r.ourName}: ${r.roomSceneImageUrl ? '✓ ' + r.roomSceneImageUrl : '✗ STILL NULL'}`);
}

await conn.end();
console.log('\nDone.');
