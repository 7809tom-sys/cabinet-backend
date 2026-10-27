-- Migration 0214 (reserved). Journal entry must be rebased to sit immediately
-- after 0213 once earlier migrations merge. Do not renumber this file; if 0214
-- is taken on rebase, move it to the next free number and say so in the PR.
ALTER TABLE `affiliates` ADD `logoDarkUrl` varchar(512);--> statement-breakpoint
ALTER TABLE `affiliates` ADD `faviconUrl` varchar(512);--> statement-breakpoint
ALTER TABLE `affiliates` ADD `backgroundColor` varchar(16);--> statement-breakpoint
ALTER TABLE `affiliates` ADD `textColor` varchar(16);--> statement-breakpoint
ALTER TABLE `affiliates` ADD `footerText` text;--> statement-breakpoint
ALTER TABLE `affiliates` ADD `showPublicEmail` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `affiliates` ADD `showPublicPhone` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `affiliates` ADD `showPublicAddress` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `affiliates` ADD `hidePlatformBranding` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `affiliates` ADD `sectionLabelsJson` text;--> statement-breakpoint
CREATE TABLE `affiliate_hidden_catalog_products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`affiliateId` int NOT NULL,
	`catalogKind` enum('cabinet','hardware','surface','closet') NOT NULL,
	`productKey` varchar(128) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `affiliate_hidden_catalog_products_id` PRIMARY KEY(`id`),
	CONSTRAINT `affiliate_hidden_catalog_product_uidx` UNIQUE(`affiliateId`,`catalogKind`,`productKey`)
);--> statement-breakpoint
CREATE INDEX `affiliate_hidden_catalog_affiliate_idx` ON `affiliate_hidden_catalog_products` (`affiliateId`,`catalogKind`);
