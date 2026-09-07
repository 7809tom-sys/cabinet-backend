CREATE TABLE `door_style_room_scenes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`styleId` int NOT NULL,
	`imageUrl` varchar(512) NOT NULL,
	`fileKey` varchar(512),
	`sortOrder` int NOT NULL DEFAULT 0,
	`isVerified` boolean NOT NULL DEFAULT false,
	`sourceNote` varchar(512),
	`sourceDistributorId` int,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `door_style_room_scenes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `door_style_room_scenes_style_idx` ON `door_style_room_scenes` (`styleId`,`sortOrder`);