CREATE TABLE `affiliate_generated_images` (
	`id` int AUTO_INCREMENT NOT NULL,
	`affiliateId` int NOT NULL,
	`sourceType` enum('deterministic','gemini') NOT NULL,
	`sourceId` int NOT NULL,
	`originalUrl` varchar(512) NOT NULL,
	`watermarkedUrl` varchar(512),
	`featuredStyleId` int,
	`isFeatured` boolean NOT NULL DEFAULT false,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `affiliate_generated_images_id` PRIMARY KEY(`id`),
	CONSTRAINT `affiliate_generated_image_source_uidx` UNIQUE(`affiliateId`,`sourceType`,`sourceId`)
);
--> statement-breakpoint
CREATE INDEX `affiliate_generated_image_created_idx` ON `affiliate_generated_images` (`affiliateId`,`createdAt`);