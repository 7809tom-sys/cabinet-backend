CREATE TABLE IF NOT EXISTS `pelican_products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pelicanCode` varchar(191) NOT NULL,
	`slug` varchar(160) NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text NOT NULL,
	`category` varchar(64) NOT NULL,
	`subCategory` varchar(128),
	`size` varchar(128),
	`listPrice` decimal(10,2),
	`priceTier2` decimal(10,2),
	`priceTier3` decimal(10,2),
	`priceTier4` decimal(10,2),
	`msrp` decimal(10,2),
	`tiered` boolean NOT NULL DEFAULT false,
	`yourCost` decimal(10,2),
	`markupPercent` decimal(6,4),
	`isPopular` boolean NOT NULL DEFAULT false,
	`popularRank` int NOT NULL DEFAULT 0,
	`imageUrl` varchar(512),
	`materialImageUrl` varchar(512),
	`showInDesigner` boolean NOT NULL DEFAULT true,
	`showInCatalog` boolean NOT NULL DEFAULT true,
	`isActive` boolean NOT NULL DEFAULT true,
	`coverageSqFt` decimal(8,2),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pelican_products_id` PRIMARY KEY(`id`),
	CONSTRAINT `pelican_products_pelicanCode_unique` UNIQUE(`pelicanCode`),
	CONSTRAINT `pelican_products_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
ALTER TABLE `pelican_products` ADD COLUMN IF NOT EXISTS `materialImageUrl` varchar(512);--> statement-breakpoint
ALTER TABLE `design_photo_renders` ADD `provenance` json;--> statement-breakpoint
ALTER TABLE `design_photo_renders` ADD `sourceImageHash` varchar(64);--> statement-breakpoint
ALTER TABLE `design_photo_renders` ADD `promptFingerprint` varchar(64);--> statement-breakpoint
ALTER TABLE `design_photo_renders` ADD `generationMethod` varchar(96);--> statement-breakpoint
ALTER TABLE `design_photo_renders` ADD `confirmedAt` timestamp;
