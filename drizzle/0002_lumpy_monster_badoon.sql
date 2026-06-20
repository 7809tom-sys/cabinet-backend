ALTER TABLE `distributors` MODIFY COLUMN `warehouseZips` json;--> statement-breakpoint
ALTER TABLE `distributors` ADD `brandName` varchar(128);--> statement-breakpoint
ALTER TABLE `distributors` ADD `brandInitials` varchar(8);--> statement-breakpoint
ALTER TABLE `distributors` ADD `whiteLabel` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `distributors` ADD `displayMode` enum('neutral','branded','series') DEFAULT 'neutral' NOT NULL;--> statement-breakpoint
ALTER TABLE `distributors` ADD `seriesName` varchar(128);--> statement-breakpoint
ALTER TABLE `distributors` ADD `markupPercent` decimal(6,4) DEFAULT '0' NOT NULL;