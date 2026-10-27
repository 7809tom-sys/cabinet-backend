-- Migration 0216. Journal idx 215, immediately after idx 214 `0213_vendor_shipping_quotes`.
-- Apply with `pnpm exec drizzle-kit migrate` (or `pnpm db:push`). Do not auto-run on Railway boot.
ALTER TABLE `kitchen_designs` ADD `recordKind` enum('customer','suggested') NOT NULL DEFAULT 'customer';--> statement-breakpoint
ALTER TABLE `kitchen_designs` ADD `suggestionOfDesignId` int;--> statement-breakpoint
ALTER TABLE `kitchen_designs` ADD `assistLabel` varchar(160);--> statement-breakpoint
ALTER TABLE `bundle_deals` ADD `sourceDesignId` int;--> statement-breakpoint
ALTER TABLE `bundle_deals` ADD `featuredOnHome` boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE `bundle_deals` ADD `priceOverride` decimal(10,2);--> statement-breakpoint
ALTER TABLE `bundle_deals` ADD `discountAmount` decimal(10,2);--> statement-breakpoint
ALTER TABLE `bundle_deals` ADD `bomSnapshotTotal` decimal(10,2);--> statement-breakpoint
ALTER TABLE `bundle_deals` ADD `lineItemsJson` json;--> statement-breakpoint
ALTER TABLE `bundle_deals` ADD `priceSnapshottedAt` timestamp;--> statement-breakpoint
ALTER TABLE `bundle_deals` ADD `layoutLabel` varchar(64);--> statement-breakpoint
ALTER TABLE `bundle_deals` ADD `doorColor` varchar(128);--> statement-breakpoint
CREATE TABLE `customer_projects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`affiliateId` int,
	`name` varchar(256) NOT NULL,
	`jobSiteAddress` varchar(512),
	`clientName` varchar(256),
	`notes` text,
	`status` enum('planning','active','quoted','completed','archived') NOT NULL DEFAULT 'planning',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customer_projects_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE INDEX `customer_projects_owner_idx` ON `customer_projects` (`userId`,`affiliateId`);--> statement-breakpoint
CREATE TABLE `customer_project_designs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`kitchenDesignId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `customer_project_designs_id` PRIMARY KEY(`id`),
	CONSTRAINT `customer_project_designs_design_uq` UNIQUE(`kitchenDesignId`)
);--> statement-breakpoint
CREATE INDEX `customer_project_designs_project_idx` ON `customer_project_designs` (`projectId`);--> statement-breakpoint
CREATE TABLE `customer_project_quotes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`orderRequestId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `customer_project_quotes_id` PRIMARY KEY(`id`),
	CONSTRAINT `customer_project_quotes_order_uq` UNIQUE(`orderRequestId`)
);--> statement-breakpoint
CREATE INDEX `customer_project_quotes_project_idx` ON `customer_project_quotes` (`projectId`);--> statement-breakpoint
CREATE TABLE `kitchen_design_revisions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`kitchenDesignId` int NOT NULL,
	`revisionNumber` int NOT NULL,
	`authorUserId` int,
	`authorLabel` varchar(160) NOT NULL,
	`kind` enum('assisted_edit','suggested_copy','revert') NOT NULL,
	`snapshot` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `kitchen_design_revisions_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE INDEX `kitchen_design_revisions_design_idx` ON `kitchen_design_revisions` (`kitchenDesignId`,`revisionNumber`);--> statement-breakpoint
CREATE TABLE `customer_notices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`affiliateId` int,
	`kind` enum('design_assisted','design_suggested') NOT NULL,
	`title` varchar(200) NOT NULL,
	`body` text NOT NULL,
	`designId` int,
	`projectId` int,
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `customer_notices_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE INDEX `customer_notices_user_idx` ON `customer_notices` (`userId`,`createdAt`);--> statement-breakpoint
CREATE TABLE `customer_quote_revisions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderRequestId` int NOT NULL,
	`userId` int NOT NULL,
	`note` text NOT NULL,
	`requestedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `customer_quote_revisions_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE INDEX `customer_quote_revisions_order_idx` ON `customer_quote_revisions` (`orderRequestId`);