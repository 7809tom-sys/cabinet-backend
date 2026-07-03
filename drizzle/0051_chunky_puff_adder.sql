CREATE TABLE `pelican_category_markups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`category` varchar(64) NOT NULL,
	`markupBps` int NOT NULL DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`updatedByOpenId` varchar(64),
	CONSTRAINT `pelican_category_markups_id` PRIMARY KEY(`id`),
	CONSTRAINT `pelican_category_markups_category_unique` UNIQUE(`category`)
);
--> statement-breakpoint
CREATE TABLE `vendor_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(191) NOT NULL,
	`sourceKey` varchar(64),
	`category` varchar(128) NOT NULL DEFAULT '',
	`contactName` varchar(191) NOT NULL DEFAULT '',
	`contactEmail` varchar(255) NOT NULL DEFAULT '',
	`contactPhone` varchar(64) NOT NULL DEFAULT '',
	`isApproved` boolean NOT NULL DEFAULT true,
	`totalSalesCents` int NOT NULL DEFAULT 0,
	`salesUpdatedAt` timestamp,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vendor_lines_id` PRIMARY KEY(`id`),
	CONSTRAINT `vendor_lines_name_unique` UNIQUE(`name`)
);
