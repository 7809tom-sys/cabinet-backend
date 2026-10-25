CREATE TABLE `banners` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(256) NOT NULL,
	`subtitle` varchar(512),
	`ctaText` varchar(128),
	`ctaUrl` varchar(512),
	`backgroundColor` varchar(32) NOT NULL DEFAULT '#1e3a5f',
	`textColor` varchar(32) NOT NULL DEFAULT '#ffffff',
	`emoji` varchar(16),
	`isActive` boolean NOT NULL DEFAULT false,
	`startDate` timestamp,
	`endDate` timestamp,
	`label` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `banners_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `category_aliases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`rawCategory` varchar(128) NOT NULL,
	`platformCategory` varchar(64) NOT NULL,
	`distributorId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `category_aliases_id` PRIMARY KEY(`id`),
	CONSTRAINT `category_aliases_raw_dist_uniq` UNIQUE(`rawCategory`,`distributorId`)
);
--> statement-breakpoint
CREATE TABLE `distributor_cabinet_overrides` (
	`id` int AUTO_INCREMENT NOT NULL,
	`distributorId` int NOT NULL,
	`cabinetId` int NOT NULL,
	`width` decimal(6,2),
	`height` decimal(6,2),
	`depth` decimal(6,2),
	`physicalWidth` decimal(6,2),
	`weight` decimal(8,2),
	`pkgLength` decimal(6,2),
	`pkgWidth` decimal(6,2),
	`pkgHeight` decimal(6,2),
	`pkgWeight` decimal(8,2),
	`note` text,
	`updatedBy` int,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `distributor_cabinet_overrides_id` PRIMARY KEY(`id`),
	CONSTRAINT `distributor_cabinet_overrides_distributorId_cabinetId_unique` UNIQUE(`distributorId`,`cabinetId`)
);
--> statement-breakpoint
DROP TABLE `affiliate_banner_schedules`;--> statement-breakpoint
DROP TABLE `affiliate_promo_discounts`;--> statement-breakpoint
DROP TABLE `affiliate_room_scene_gallery`;--> statement-breakpoint
DROP TABLE `distributor_column_mappings`;--> statement-breakpoint
DROP TABLE `import_pending_skus`;--> statement-breakpoint
ALTER TABLE `code_aliases` DROP INDEX `code_aliases_rawCodeCanon_unique`;--> statement-breakpoint
ALTER TABLE `media_library` DROP INDEX `media_library_fileKey_unique`;--> statement-breakpoint
ALTER TABLE `measure_sessions` MODIFY COLUMN `userId` int NOT NULL;--> statement-breakpoint
ALTER TABLE `media_library` MODIFY COLUMN `filename` varchar(255);--> statement-breakpoint
ALTER TABLE `media_library` MODIFY COLUMN `mimeType` varchar(128);--> statement-breakpoint
ALTER TABLE `orders` MODIFY COLUMN `stripeSessionId` varchar(255);--> statement-breakpoint
ALTER TABLE `orders` MODIFY COLUMN `stripePaymentIntentId` varchar(255);--> statement-breakpoint
ALTER TABLE `orders` MODIFY COLUMN `paymentStatus` enum('pending','paid','failed','refunded') DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `page_content` MODIFY COLUMN `pageKey` varchar(128) NOT NULL;--> statement-breakpoint
ALTER TABLE `page_content` MODIFY COLUMN `value` text;--> statement-breakpoint
ALTER TABLE `cabinets` ADD `numberOfFixedShelves` int;--> statement-breakpoint
ALTER TABLE `cabinets` ADD `numberOfAdjShelves` int;--> statement-breakpoint
ALTER TABLE `cabinets` ADD `isNotCabinet` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `cabinets` ADD `sku` varchar(128);--> statement-breakpoint
ALTER TABLE `cabinets` ADD `vendorSku` varchar(128);--> statement-breakpoint
ALTER TABLE `cabinets` ADD `altSku1` varchar(128);--> statement-breakpoint
ALTER TABLE `cabinets` ADD `altSku2` varchar(128);--> statement-breakpoint
ALTER TABLE `cabinets` ADD `altSku3` varchar(128);--> statement-breakpoint
ALTER TABLE `cabinets` ADD `stainColor` varchar(128);--> statement-breakpoint
ALTER TABLE `cabinets` ADD `constructionMethod` varchar(256);--> statement-breakpoint
ALTER TABLE `cabinets` ADD `roomSceneUrl` varchar(512);--> statement-breakpoint
ALTER TABLE `code_aliases` ADD `userId` int;--> statement-breakpoint
ALTER TABLE `code_aliases` ADD CONSTRAINT `code_aliases_raw_user_uidx` UNIQUE(`rawCodeCanon`,`userId`);--> statement-breakpoint
ALTER TABLE `affiliate_style_branding` DROP COLUMN `hidden`;--> statement-breakpoint
ALTER TABLE `affiliates` DROP COLUMN `heroHeadline`;--> statement-breakpoint
ALTER TABLE `affiliates` DROP COLUMN `promoBannerText`;--> statement-breakpoint
ALTER TABLE `affiliates` DROP COLUMN `promoBannerActive`;--> statement-breakpoint
ALTER TABLE `affiliates` DROP COLUMN `promoBannerImageUrl`;--> statement-breakpoint
ALTER TABLE `affiliates` DROP COLUMN `address`;--> statement-breakpoint
ALTER TABLE `affiliates` DROP COLUMN `businessHours`;--> statement-breakpoint
ALTER TABLE `affiliates` DROP COLUMN `bankName`;--> statement-breakpoint
ALTER TABLE `affiliates` DROP COLUMN `bankRoutingNumber`;--> statement-breakpoint
ALTER TABLE `affiliates` DROP COLUMN `bankAccountNumber`;--> statement-breakpoint
ALTER TABLE `affiliates` DROP COLUMN `bankAccountType`;--> statement-breakpoint
ALTER TABLE `affiliates` DROP COLUMN `bankVerified`;--> statement-breakpoint
ALTER TABLE `affiliates` DROP COLUMN `bankVerifiedAt`;--> statement-breakpoint
ALTER TABLE `affiliates` DROP COLUMN `bankAdminNotes`;--> statement-breakpoint
ALTER TABLE `affiliates` DROP COLUMN `ssnCardUrl`;--> statement-breakpoint
ALTER TABLE `affiliates` DROP COLUMN `dlFrontUrl`;--> statement-breakpoint
ALTER TABLE `affiliates` DROP COLUMN `dlBackUrl`;--> statement-breakpoint
ALTER TABLE `affiliates` DROP COLUMN `idVerified`;--> statement-breakpoint
ALTER TABLE `affiliates` DROP COLUMN `idVerifiedAt`;--> statement-breakpoint
ALTER TABLE `affiliates` DROP COLUMN `idAdminNotes`;--> statement-breakpoint
ALTER TABLE `affiliates` DROP COLUMN `payoutConsentSigned`;--> statement-breakpoint
ALTER TABLE `affiliates` DROP COLUMN `payoutConsentSignedAt`;--> statement-breakpoint
ALTER TABLE `affiliates` DROP COLUMN `payoutConsentIp`;--> statement-breakpoint
ALTER TABLE `affiliates` DROP COLUMN `payoutConsentName`;--> statement-breakpoint
ALTER TABLE `affiliates` DROP COLUMN `payoutReady`;--> statement-breakpoint
ALTER TABLE `affiliates` DROP COLUMN `payoutReadyAt`;--> statement-breakpoint
ALTER TABLE `distributor_skus` DROP COLUMN `wholesalePriceOverride`;--> statement-breakpoint
ALTER TABLE `distributor_skus` DROP COLUMN `contractorPriceOverride`;--> statement-breakpoint
ALTER TABLE `distributor_skus` DROP COLUMN `homeownerPriceOverride`;--> statement-breakpoint
ALTER TABLE `distributor_skus` DROP COLUMN `availableWarehouses`;--> statement-breakpoint
ALTER TABLE `door_styles` DROP COLUMN `dominantColor`;--> statement-breakpoint
ALTER TABLE `door_styles` DROP COLUMN `pricingVerifiedAt`;--> statement-breakpoint
ALTER TABLE `pricing_settings` DROP COLUMN `tierPricesRecalcAt`;