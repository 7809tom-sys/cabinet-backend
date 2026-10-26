import { getDb } from '../server/db';
import { cabinets } from '../drizzle/schema';
import { like } from 'drizzle-orm';

const updates = [
  { pattern: '%base_full_height_single%', url: '/manus-storage/base_full_height_single_e7202551.png' },
  { pattern: '%base_full_height_double%', url: '/manus-storage/base_full_height_double_bfc5df55.png' },
  { pattern: '%base_single_door_drawer%', url: '/manus-storage/base_single_door_drawer_e3c5fd05.png' },
  { pattern: '%base_double_door_drawer%', url: '/manus-storage/base_double_door_drawer_268dc6aa.png' },
  { pattern: '%base_double_door_2drawer%', url: '/manus-storage/base_double_door_2drawer_07ca52f7.png' },
  { pattern: '%base_sink_single%', url: '/manus-storage/base_sink_single_14b5f051.png' },
  { pattern: '%base_sink_double%', url: '/manus-storage/base_sink_double_c2fd33c9.png' },
  { pattern: '%base_farm_sink%', url: '/manus-storage/base_farm_sink_7c79b7c9.png' },
  { pattern: '%base_drawer_2%', url: '/manus-storage/base_drawer_2_b804efb7.png' },
  { pattern: '%base_drawer_3%', url: '/manus-storage/base_drawer_3_3da24e31.png' },
  { pattern: '%base_corner_easy_reach%', url: '/manus-storage/base_corner_easy_reach_f3dba079.png' },
  { pattern: '%base_blind%', url: '/manus-storage/base_blind_940ac62d.png' },
  { pattern: '%wall_single_door_30h%', url: '/manus-storage/wall_single_door_30h_004734a6.png' },
  { pattern: '%wall_double_door_30h%', url: '/manus-storage/wall_double_door_30h_fc98e833.png' },
  { pattern: '%wall_single_door_36h%', url: '/manus-storage/wall_single_door_36h_179304b7.png' },
  { pattern: '%wall_double_door_36h%', url: '/manus-storage/wall_double_door_36h_d7a434fb.png' },
  { pattern: '%wall_single_door_42h%', url: '/manus-storage/wall_single_door_42h_7beea2a0.png' },
  { pattern: '%wall_double_door_42h%', url: '/manus-storage/wall_double_door_42h_68df20c4.png' },
  { pattern: '%wall_corner_diagonal%', url: '/manus-storage/wall_corner_diagonal_348139ee.png' },
  { pattern: '%wall_bridge%', url: '/manus-storage/wall_bridge_9d83631d.png' },
  { pattern: '%wall_refrigerator%', url: '/manus-storage/wall_refrigerator_7a03a889.png' },
  { pattern: '%wall_glass_door%', url: '/manus-storage/wall_glass_door_19a09f31.png' },
  { pattern: '%tall_utility_2door%', url: '/manus-storage/tall_utility_2door_b5f37ce2.png' },
  { pattern: '%tall_utility_4door%', url: '/manus-storage/tall_utility_4door_a599103f.png' },
  { pattern: '%tall_oven%', url: '/manus-storage/tall_oven_89d1e438.png' },
  { pattern: '%vanity_sink_base_single%', url: '/manus-storage/vanity_sink_base_single_d7409d3f.png' },
  { pattern: '%vanity_sink_base_double%', url: '/manus-storage/vanity_sink_base_double_8cd4a6de.png' },
  { pattern: '%vanity_drawer%', url: '/manus-storage/vanity_drawer_7f055e1f.png' },
  { pattern: '%vanity_combo%', url: '/manus-storage/vanity_combo_e8fedbf9.png' },
];

async function main() {
  const db = await getDb();
  let total = 0;
  for (const { pattern, url } of updates) {
    const result = await db
      .update(cabinets)
      .set({ specImageUrl: url })
      .where(like(cabinets.specImageUrl, pattern));
    const affected = (result as any)[0]?.affectedRows ?? 0;
    if (affected > 0) {
      console.log(`  Updated ${affected} rows: ${pattern} → ${url.split('/').pop()}`);
      total += affected;
    }
  }
  console.log(`\nTotal updated: ${total} cabinets`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
