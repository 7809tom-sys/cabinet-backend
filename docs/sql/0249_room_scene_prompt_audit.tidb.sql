-- TiDB SQL editor version. Numbered 0249. Run after 0248.
-- Paste each numbered block on its own. One statement per block.
-- Every table is cabinet_dealz.<table>. No reserved-word aliases.
-- This file only adds one column. It inserts nothing, updates no rows, and
-- deletes nothing. Safe to re-run (IF NOT EXISTS).
--
-- Why: the automatic door-style room scene was coming out in the wrong door
-- style and color. The prompt is now built from the color of record and the
-- profile details that are actually filled in, and the exact prompt is stored
-- on the generation row so the result can be audited.
--
-- The prompt is prompt text only: it contains color values, profile
-- measurements, and image URLs that the generation already used. It contains no
-- credential.

-- 1
ALTER TABLE cabinet_dealz.door_style_room_scene_generations
  ADD COLUMN IF NOT EXISTS prompt TEXT NULL;

-- 2 read-only check. Expect 1.
SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'cabinet_dealz'
    AND TABLE_NAME = 'door_style_room_scene_generations'
    AND COLUMN_NAME = 'prompt';

-- 3 read-only check. How many generations already recorded a prompt.
SELECT COUNT(*) AS generationsWithPrompt
FROM cabinet_dealz.door_style_room_scene_generations
WHERE prompt IS NOT NULL;
