/**
 * Seed the media_images table with the 29 Capital spec book line drawings.
 * Run: npx tsx scripts/seed_media_library.ts
 */
import { getDb } from "../server/db";
import { mediaImages } from "../drizzle/schema";

const DRAWINGS = [
  // Base cabinets
  { label: "Base – Single Door / Drawer",        url: "/manus-storage/base_single_door_drawer_e3c5fd05.png" },
  { label: "Base – Double Door / Drawer",        url: "/manus-storage/base_double_door_drawer_268dc6aa.png" },
  { label: "Base – Double Door 2 Drawer",        url: "/manus-storage/base_double_door_2drawer_07ca52f7.png" },
  { label: "Base – Full Height Single Door",     url: "/manus-storage/base_full_height_single_e7202551.png" },
  { label: "Base – Full Height Double Door",     url: "/manus-storage/base_full_height_double_bfc5df55.png" },
  { label: "Base – Sink Single Door",            url: "/manus-storage/base_sink_single_14b5f051.png" },
  { label: "Base – Sink Double Door",            url: "/manus-storage/base_sink_double_c2fd33c9.png" },
  { label: "Base – Farm Sink",                   url: "/manus-storage/base_farm_sink_7c79b7c9.png" },
  { label: "Base – 2 Drawer Bank",               url: "/manus-storage/base_drawer_2_b804efb7.png" },
  { label: "Base – 3 Drawer Bank",               url: "/manus-storage/base_drawer_3_3da24e31.png" },
  { label: "Base – Corner Blind",                url: "/manus-storage/base_blind_940ac62d.png" },
  { label: "Base – Corner Easy Reach",           url: "/manus-storage/base_corner_easy_reach_f3dba079.png" },
  // Wall cabinets
  { label: "Wall – Single Door 30\"H",           url: "/manus-storage/wall_single_door_30h_004734a6.png" },
  { label: "Wall – Single Door 36\"H",           url: "/manus-storage/wall_single_door_36h_179304b7.png" },
  { label: "Wall – Single Door 42\"H",           url: "/manus-storage/wall_single_door_42h_7beea2a0.png" },
  { label: "Wall – Double Door 30\"H",           url: "/manus-storage/wall_double_door_30h_fc98e833.png" },
  { label: "Wall – Double Door 36\"H",           url: "/manus-storage/wall_double_door_36h_d7a434fb.png" },
  { label: "Wall – Double Door 42\"H",           url: "/manus-storage/wall_double_door_42h_68df20c4.png" },
  { label: "Wall – Glass Door",                  url: "/manus-storage/wall_glass_door_19a09f31.png" },
  { label: "Wall – Bridge Cabinet",              url: "/manus-storage/wall_bridge_9d83631d.png" },
  { label: "Wall – Diagonal Corner",             url: "/manus-storage/wall_corner_diagonal_348139ee.png" },
  { label: "Wall – Refrigerator Cabinet",        url: "/manus-storage/wall_refrigerator_7a03a889.png" },
  // Tall cabinets
  { label: "Tall – Utility / Pantry 2 Door",    url: "/manus-storage/tall_utility_2door_b5f37ce2.png" },
  { label: "Tall – Utility / Pantry 4 Door",    url: "/manus-storage/tall_utility_4door_a599103f.png" },
  { label: "Tall – Oven / Microwave Tower",      url: "/manus-storage/tall_oven_89d1e438.png" },
  // Vanity cabinets
  { label: "Vanity – Sink Base Single Door",     url: "/manus-storage/vanity_sink_base_single_d7409d3f.png" },
  { label: "Vanity – Sink Base Double Door",     url: "/manus-storage/vanity_sink_base_double_8cd4a6de.png" },
  { label: "Vanity – Drawer Base",               url: "/manus-storage/vanity_drawer_7f055e1f.png" },
  { label: "Vanity – Combo (Door + Drawer)",     url: "/manus-storage/vanity_combo_e8fedbf9.png" },
];

async function main() {
  const db = await getDb();
  if (!db) { console.error("DB unavailable"); process.exit(1); }

  // Check existing entries to avoid duplicates
  const existing = await db.select({ url: mediaImages.url }).from(mediaImages);
  const existingUrls = new Set(existing.map(r => r.url));

  let inserted = 0;
  for (const drawing of DRAWINGS) {
    if (existingUrls.has(drawing.url)) {
      console.log(`  skip (exists): ${drawing.label}`);
      continue;
    }
    await db.insert(mediaImages).values({
      label:  drawing.label,
      folder: "Cabinet Drawings",
      url:    drawing.url,
    });
    console.log(`  inserted: ${drawing.label}`);
    inserted++;
  }

  console.log(`\nDone. Inserted ${inserted} of ${DRAWINGS.length} drawings.`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
