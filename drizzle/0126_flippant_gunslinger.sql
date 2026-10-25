CREATE TABLE `design_photo_renders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`sceneSignature` varchar(191) NOT NULL,
	`imageUrl` varchar(512) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `design_photo_renders_id` PRIMARY KEY(`id`),
	CONSTRAINT `design_photo_renders_user_scene_uq` UNIQUE(`userId`,`sceneSignature`)
);
--> statement-breakpoint
CREATE INDEX `design_photo_renders_user_updated_idx` ON `design_photo_renders` (`userId`,`updatedAt`);