CREATE TABLE `affiliate_banner_schedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`affiliate_id` int NOT NULL,
	`message` text NOT NULL,
	`holiday_key` varchar(64),
	`start_date` varchar(10) NOT NULL,
	`end_date` varchar(10) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `affiliate_banner_schedules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `affiliate_promo_discounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`affiliateId` int NOT NULL,
	`label` varchar(128) NOT NULL,
	`targetType` varchar(32) NOT NULL DEFAULT 'style',
	`targetId` int,
	`discountBps` int NOT NULL DEFAULT 0,
	`startsAt` timestamp,
	`endsAt` timestamp,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `affiliate_promo_discounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sku_master_aliases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`aliasCode` varchar(64) NOT NULL,
	`masterCode` varchar(64) NOT NULL,
	`notes` text,
	`conflictStatus` enum('ok','conflict') NOT NULL DEFAULT 'ok',
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sku_master_aliases_id` PRIMARY KEY(`id`),
	CONSTRAINT `sku_master_aliases_aliasCode_unique` UNIQUE(`aliasCode`)
);
--> statement-breakpoint
CREATE TABLE `sku_matching_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ruleName` varchar(128) NOT NULL,
	`description` text,
	`weight` int NOT NULL DEFAULT 5,
	`enabled` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sku_matching_rules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sku_merge_suggestions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`aliasCode` varchar(64) NOT NULL,
	`masterCode` varchar(64) NOT NULL,
	`similarityScore` int NOT NULL,
	`reason` text,
	`status` enum('pending','approved','dismissed') NOT NULL DEFAULT 'pending',
	`reviewedBy` int,
	`reviewedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sku_merge_suggestions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `distributor_cabinet_overrides` ADD `imageUrl` varchar(1024);