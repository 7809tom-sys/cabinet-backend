-- TiDB SQL editor version of drizzle/0220_door_style_auto_room_scene.sql.
-- Run each numbered statement on its own. No statement-breakpoint markers.
-- Safe to re-run: IF NOT EXISTS, tables qualified as cabinet_dealz.<table>.

-- 1
ALTER TABLE cabinet_dealz.door_styles ADD COLUMN IF NOT EXISTS drawerSampleVerified BOOLEAN NOT NULL DEFAULT FALSE;

-- 2
CREATE TABLE IF NOT EXISTS cabinet_dealz.door_style_room_scene_generations (
  id INT NOT NULL AUTO_INCREMENT,
  styleId INT NOT NULL,
  status ENUM('pending','generating','ready','failed') NOT NULL DEFAULT 'pending',
  doorImageUrl VARCHAR(512) NOT NULL,
  drawerImageUrl VARCHAR(512) NOT NULL,
  claimToken VARCHAR(64) NULL,
  sceneId INT NULL,
  imageUrl VARCHAR(512) NULL,
  errorMessage VARCHAR(512) NULL,
  attemptCount INT NOT NULL DEFAULT 0,
  startedAt TIMESTAMP NULL DEFAULT NULL,
  completedAt TIMESTAMP NULL DEFAULT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

-- 3
CREATE UNIQUE INDEX IF NOT EXISTS door_style_room_scene_generations_style_uidx ON cabinet_dealz.door_style_room_scene_generations (styleId);
