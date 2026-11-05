-- Migration 0235. Journal idx 234, when 1795600000000. It follows
-- 0234_vendor_email_purposes, the last entry in the journal.
-- TiDB SQL editor statements are in docs/sql/0249_room_scene_prompt_audit.tidb.sql.
--
-- Additive only: one nullable text column that keeps the exact prompt sent to
-- the image model, so a room scene that came out wrong can be traced back to
-- what the model was told.
ALTER TABLE `door_style_room_scene_generations` ADD COLUMN IF NOT EXISTS `prompt` text NULL;
