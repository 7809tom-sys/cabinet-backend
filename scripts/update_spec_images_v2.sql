-- Update all cabinet spec images to clean v2 drawings (no headers, no red callouts)

-- Base: Full Height Single Door (BFH*)
UPDATE generic_cabinets SET spec_image_url = '/manus-storage/base_full_height_single_e7202551.png'
WHERE spec_image_url LIKE '%base_full_height_single%';

-- Base: Full Height Double Door (B*FH)
UPDATE generic_cabinets SET spec_image_url = '/manus-storage/base_full_height_double_bfc5df55.png'
WHERE spec_image_url LIKE '%base_full_height_double%';

-- Base: Single Door Single Drawer (B12, B15, B18, B21)
UPDATE generic_cabinets SET spec_image_url = '/manus-storage/base_single_door_drawer_e3c5fd05.png'
WHERE spec_image_url LIKE '%base_single_door_drawer%';

-- Base: Double Door Single Drawer
UPDATE generic_cabinets SET spec_image_url = '/manus-storage/base_double_door_drawer_268dc6aa.png'
WHERE spec_image_url LIKE '%base_double_door_drawer%';

-- Base: Double Door Double Drawer
UPDATE generic_cabinets SET spec_image_url = '/manus-storage/base_double_door_2drawer_07ca52f7.png'
WHERE spec_image_url LIKE '%base_double_door_2drawer%';

-- Base: Sink Single Door
UPDATE generic_cabinets SET spec_image_url = '/manus-storage/base_sink_single_14b5f051.png'
WHERE spec_image_url LIKE '%base_sink_single%';

-- Base: Sink Double Door
UPDATE generic_cabinets SET spec_image_url = '/manus-storage/base_sink_double_c2fd33c9.png'
WHERE spec_image_url LIKE '%base_sink_double%';

-- Base: Farm Sink
UPDATE generic_cabinets SET spec_image_url = '/manus-storage/base_farm_sink_7c79b7c9.png'
WHERE spec_image_url LIKE '%base_farm_sink%';

-- Base: 2 Drawer
UPDATE generic_cabinets SET spec_image_url = '/manus-storage/base_drawer_2_b804efb7.png'
WHERE spec_image_url LIKE '%base_drawer_2%';

-- Base: 3 Drawer
UPDATE generic_cabinets SET spec_image_url = '/manus-storage/base_drawer_3_3da24e31.png'
WHERE spec_image_url LIKE '%base_drawer_3%';

-- Base: Corner Easy Reach
UPDATE generic_cabinets SET spec_image_url = '/manus-storage/base_corner_easy_reach_f3dba079.png'
WHERE spec_image_url LIKE '%base_corner_easy_reach%';

-- Base: Blind Corner
UPDATE generic_cabinets SET spec_image_url = '/manus-storage/base_blind_940ac62d.png'
WHERE spec_image_url LIKE '%base_blind%';

-- Wall: Single Door 30H
UPDATE generic_cabinets SET spec_image_url = '/manus-storage/wall_single_door_30h_004734a6.png'
WHERE spec_image_url LIKE '%wall_single_door_30h%';

-- Wall: Double Door 30H
UPDATE generic_cabinets SET spec_image_url = '/manus-storage/wall_double_door_30h_fc98e833.png'
WHERE spec_image_url LIKE '%wall_double_door_30h%';

-- Wall: Single Door 36H
UPDATE generic_cabinets SET spec_image_url = '/manus-storage/wall_single_door_36h_179304b7.png'
WHERE spec_image_url LIKE '%wall_single_door_36h%';

-- Wall: Double Door 36H
UPDATE generic_cabinets SET spec_image_url = '/manus-storage/wall_double_door_36h_d7a434fb.png'
WHERE spec_image_url LIKE '%wall_double_door_36h%';

-- Wall: Single Door 42H
UPDATE generic_cabinets SET spec_image_url = '/manus-storage/wall_single_door_42h_7beea2a0.png'
WHERE spec_image_url LIKE '%wall_single_door_42h%';

-- Wall: Double Door 42H
UPDATE generic_cabinets SET spec_image_url = '/manus-storage/wall_double_door_42h_68df20c4.png'
WHERE spec_image_url LIKE '%wall_double_door_42h%';

-- Wall: Corner Diagonal
UPDATE generic_cabinets SET spec_image_url = '/manus-storage/wall_corner_diagonal_348139ee.png'
WHERE spec_image_url LIKE '%wall_corner_diagonal%';

-- Wall: Bridge
UPDATE generic_cabinets SET spec_image_url = '/manus-storage/wall_bridge_9d83631d.png'
WHERE spec_image_url LIKE '%wall_bridge%';

-- Wall: Refrigerator
UPDATE generic_cabinets SET spec_image_url = '/manus-storage/wall_refrigerator_7a03a889.png'
WHERE spec_image_url LIKE '%wall_refrigerator%';

-- Wall: Glass Door
UPDATE generic_cabinets SET spec_image_url = '/manus-storage/wall_glass_door_19a09f31.png'
WHERE spec_image_url LIKE '%wall_glass_door%';

-- Tall: Utility 2 Door
UPDATE generic_cabinets SET spec_image_url = '/manus-storage/tall_utility_2door_b5f37ce2.png'
WHERE spec_image_url LIKE '%tall_utility_2door%';

-- Tall: Utility 4 Door
UPDATE generic_cabinets SET spec_image_url = '/manus-storage/tall_utility_4door_a599103f.png'
WHERE spec_image_url LIKE '%tall_utility_4door%';

-- Tall: Oven Cabinet
UPDATE generic_cabinets SET spec_image_url = '/manus-storage/tall_oven_89d1e438.png'
WHERE spec_image_url LIKE '%tall_oven%';

-- Vanity: Sink Base Single
UPDATE generic_cabinets SET spec_image_url = '/manus-storage/vanity_sink_base_single_d7409d3f.png'
WHERE spec_image_url LIKE '%vanity_sink_base_single%';

-- Vanity: Sink Base Double
UPDATE generic_cabinets SET spec_image_url = '/manus-storage/vanity_sink_base_double_8cd4a6de.png'
WHERE spec_image_url LIKE '%vanity_sink_base_double%';

-- Vanity: Drawer Base
UPDATE generic_cabinets SET spec_image_url = '/manus-storage/vanity_drawer_7f055e1f.png'
WHERE spec_image_url LIKE '%vanity_drawer%';

-- Vanity: Combo Base
UPDATE generic_cabinets SET spec_image_url = '/manus-storage/vanity_combo_e8fedbf9.png'
WHERE spec_image_url LIKE '%vanity_combo%';
