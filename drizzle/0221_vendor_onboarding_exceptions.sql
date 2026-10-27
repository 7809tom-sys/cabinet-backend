-- Migration 0221. Main's journal ends at 0219_w9_tax_id_at_rest (idx 218).
-- Open PR #21 (cursor/vendor-referrals-d306) already claims 0220_vendor_referrals.sql.
-- This file is 0221 so the two migrations do not share a number. If another
-- branch lands 0221 first, renumber this journal entry after it.
-- Snapshot prevId is 0219 (52aac6dc-0a8f-4ed6-a8b4-6dece343dd2c).
CREATE TABLE `vendor_onboarding_imports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`distributorId` int NOT NULL,
	`fileName` varchar(255),
	`uploadedByUserId` int,
	`matchedCount` int NOT NULL DEFAULT 0,
	`flaggedCount` int NOT NULL DEFAULT 0,
	`completedCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `vendor_onboarding_imports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vendor_onboarding_rows` (
	`id` int AUTO_INCREMENT NOT NULL,
	`importId` int NOT NULL,
	`distributorId` int NOT NULL,
	`rowNumber` int NOT NULL,
	`rawSku` varchar(128) NOT NULL,
	`normalizedSku` varchar(128) NOT NULL,
	`status` enum('matched','flagged','completed') NOT NULL,
	`flagReason` enum('unknown_sku','ambiguous','missing_special'),
	`missingFields` json,
	`cabinetId` int,
	`masterCode` varchar(64),
	`matchedVia` varchar(16),
	`candidateMasterCodes` json,
	`reviewCabinetId` int,
	`distributorName` varchar(128),
	`styleName` varchar(128),
	`colorName` varchar(64),
	`price` decimal(10,2),
	`styleId` int,
	`skuId` int,
	`category` varchar(64),
	`subCategory` varchar(128),
	`width` decimal(7,3),
	`height` decimal(7,3),
	`depth` decimal(7,3),
	`description` text,
	`numberOfDoors` int,
	`numberOfDrawers` int,
	`trimSupplierId` int,
	`trimHeld` boolean NOT NULL DEFAULT false,
	`message` varchar(512),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vendor_onboarding_rows_id` PRIMARY KEY(`id`),
	CONSTRAINT `vendor_onboarding_rows_import_row_uq` UNIQUE(`importId`,`rowNumber`)
);
--> statement-breakpoint
CREATE INDEX `vendor_onboarding_imports_distributor_idx` ON `vendor_onboarding_imports` (`distributorId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `vendor_onboarding_rows_import_status_idx` ON `vendor_onboarding_rows` (`importId`,`status`);--> statement-breakpoint
CREATE INDEX `vendor_onboarding_rows_distributor_status_idx` ON `vendor_onboarding_rows` (`distributorId`,`status`);
