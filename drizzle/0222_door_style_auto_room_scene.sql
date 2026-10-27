-- Migration 0222. Journal idx 221, when 1794300000000.
-- Follows 0221_vendor_onboarding_exceptions (open PR #23, snapshot
-- bc462012-e6f2-46ea-addb-cbfde6ed0879). Main already has
-- 0220_vendor_referrals at idx 219. Idx 220 is left for 0221.
-- Drawer-front verification plus one auto room-scene job per door style.
-- TiDB SQL editor statements are in
-- docs/sql/0222_door_style_auto_room_scene.tidb.sql.
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
