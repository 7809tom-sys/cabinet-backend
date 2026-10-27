-- Migration 0220. Journal idx 219, when 1794100000000, immediately after
-- 0219_w9_tax_id_at_rest. Drawer-front verification plus one auto room-scene
-- job per door style. TiDB SQL editor statements are in
-- docs/sql/0220_door_style_auto_room_scene.tidb.sql.
ALTER TABLE `door_styles` ADD `drawerSampleVerified` boolean NOT NULL DEFAULT false;
--> statement-breakpoint
CREATE TABLE `door_style_room_scene_generations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`styleId` int NOT NULL,
	`status` enum('pending','generating','ready','failed') NOT NULL DEFAULT 'pending',
	`doorImageUrl` varchar(512) NOT NULL,
	`drawerImageUrl` varchar(512) NOT NULL,
	`claimToken` varchar(64),
	`sceneId` int,
	`imageUrl` varchar(512),
	`errorMessage` varchar(512),
	`attemptCount` int NOT NULL DEFAULT 0,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `door_style_room_scene_generations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `door_style_room_scene_generations_style_uidx` ON `door_style_room_scene_generations` (`styleId`);
