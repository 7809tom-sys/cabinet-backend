-- 0209_vendor_room_scenes_and_promotions
-- Named room-scene groups on the existing door-style scene rows, plus a
-- dollars-off promotion type. Each statement is safe to run more than once.
SET @schema := DATABASE();

SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = 'door_style_room_scenes' AND COLUMN_NAME = 'sceneName'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `door_style_room_scenes` ADD `sceneName` varchar(128) NOT NULL DEFAULT ''Room''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = 'door_style_room_scenes' AND COLUMN_NAME = 'sceneDescription'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `door_style_room_scenes` ADD `sceneDescription` varchar(512)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = 'door_style_room_scenes' AND COLUMN_NAME = 'sceneSortOrder'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `door_style_room_scenes` ADD `sceneSortOrder` int NOT NULL DEFAULT 0',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = 'door_style_room_scenes' AND COLUMN_NAME = 'isCover'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `door_style_room_scenes` ADD `isCover` boolean NOT NULL DEFAULT false',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = 'door_style_room_scenes' AND COLUMN_NAME = 'taggedCabinetIds'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `door_style_room_scenes` ADD `taggedCabinetIds` json',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = 'door_style_room_scenes' AND COLUMN_NAME = 'taggedStyleIds'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `door_style_room_scenes` ADD `taggedStyleIds` json',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = 'door_style_room_scenes' AND INDEX_NAME = 'door_style_room_scenes_scene_idx'
);
SET @sql := IF(@exists = 0,
  'CREATE INDEX `door_style_room_scenes_scene_idx` ON `door_style_room_scenes` (`styleId`, `sceneName`, `sceneSortOrder`)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_fixed_amount := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = 'vendor_promotions' AND COLUMN_NAME = 'discountType' AND COLUMN_TYPE LIKE '%fixed_amount%'
);
SET @sql := IF(@has_fixed_amount = 0,
  'ALTER TABLE `vendor_promotions` MODIFY `discountType` enum(''percent'',''fixed_price'',''fixed_amount'') NOT NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
