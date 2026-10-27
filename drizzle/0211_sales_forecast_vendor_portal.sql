CREATE TABLE IF NOT EXISTS `sales_forecast_close_brackets` (
  `id` int AUTO_INCREMENT NOT NULL,
  `minDays` int NOT NULL,
  `maxDays` int,
  `closePercent` int NOT NULL,
  `sortOrder` int NOT NULL DEFAULT 0,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `sales_forecast_close_brackets_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
INSERT INTO `sales_forecast_close_brackets` (`minDays`, `maxDays`, `closePercent`, `sortOrder`)
SELECT 0, 30, 70, 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `sales_forecast_close_brackets`);--> statement-breakpoint
INSERT INTO `sales_forecast_close_brackets` (`minDays`, `maxDays`, `closePercent`, `sortOrder`)
SELECT 31, 60, 55, 1 FROM DUAL
WHERE (SELECT COUNT(*) FROM `sales_forecast_close_brackets`) = 1;--> statement-breakpoint
INSERT INTO `sales_forecast_close_brackets` (`minDays`, `maxDays`, `closePercent`, `sortOrder`)
SELECT 61, 90, 40, 2 FROM DUAL
WHERE (SELECT COUNT(*) FROM `sales_forecast_close_brackets`) = 2;--> statement-breakpoint
INSERT INTO `sales_forecast_close_brackets` (`minDays`, `maxDays`, `closePercent`, `sortOrder`)
SELECT 91, NULL, 20, 3 FROM DUAL
WHERE (SELECT COUNT(*) FROM `sales_forecast_close_brackets`) = 3;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `pricing_setting_audit` (
  `id` int AUTO_INCREMENT NOT NULL,
  `field` varchar(64) NOT NULL,
  `oldValue` varchar(64),
  `newValue` varchar(64),
  `userId` int,
  `openId` varchar(64),
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `pricing_setting_audit_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `vendor_inventory_api_keys` (
  `id` int AUTO_INCREMENT NOT NULL,
  `vendorScope` varchar(32) NOT NULL,
  `keyPrefix` varchar(16) NOT NULL,
  `keyHash` varchar(64) NOT NULL,
  `createdByUserId` int,
  `revokedAt` timestamp NULL,
  `lastUsedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `vendor_inventory_api_keys_id` PRIMARY KEY(`id`),
  CONSTRAINT `vendor_inventory_api_keys_hash_uq` UNIQUE(`keyHash`)
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `vendor_price_increases` (
  `id` int AUTO_INCREMENT NOT NULL,
  `vendorScope` varchar(32) NOT NULL,
  `productTable` varchar(32) NOT NULL,
  `productId` int NOT NULL,
  `sku` varchar(128) NOT NULL,
  `scope` enum('product','category','style','catalog') NOT NULL DEFAULT 'product',
  `currentWholesale` decimal(10,2),
  `nextWholesale` decimal(10,2) NOT NULL,
  `effectiveDate` varchar(10),
  `note` varchar(512),
  `status` enum('pending','acknowledged','applied','dismissed') NOT NULL DEFAULT 'pending',
  `createdByUserId` int,
  `reviewedByUserId` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `reviewedAt` timestamp NULL,
  CONSTRAINT `vendor_price_increases_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `vendor_admin_updates` (
  `id` int AUTO_INCREMENT NOT NULL,
  `vendorScope` varchar(32) NOT NULL,
  `type` enum('inventory_sync','low_stock','price_increase','out_of_stock') NOT NULL,
  `title` varchar(255) NOT NULL,
  `body` text,
  `sku` varchar(128),
  `readAt` timestamp NULL,
  `acknowledgedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `vendor_admin_updates_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `vendor_catalog_edit_log` (
  `id` int AUTO_INCREMENT NOT NULL,
  `vendorScope` varchar(32) NOT NULL,
  `productTable` varchar(32) NOT NULL,
  `productId` int NOT NULL,
  `field` varchar(64) NOT NULL,
  `oldValue` text,
  `newValue` text,
  `userId` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `vendor_catalog_edit_log_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `door_style_sample_offers` (
  `id` int AUTO_INCREMENT NOT NULL,
  `distributorId` int NOT NULL,
  `styleId` int NOT NULL,
  `available` boolean NOT NULL DEFAULT false,
  `catalogCabinetId` int,
  `sampleSku` varchar(128),
  `price` decimal(10,2),
  `leadTimeDays` int,
  `notes` varchar(512),
  `updatedByUserId` int,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `door_style_sample_offers_id` PRIMARY KEY(`id`),
  CONSTRAINT `door_style_sample_offers_style_uq` UNIQUE(`distributorId`, `styleId`)
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sample_kits` (
  `id` int AUTO_INCREMENT NOT NULL,
  `distributorId` int NOT NULL,
  `name` varchar(191) NOT NULL,
  `description` text,
  `price` decimal(10,2),
  `isFree` boolean NOT NULL DEFAULT false,
  `active` boolean NOT NULL DEFAULT true,
  `imageUrl` varchar(512),
  `createdByUserId` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `sample_kits_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sample_kit_items` (
  `id` int AUTO_INCREMENT NOT NULL,
  `kitId` int NOT NULL,
  `styleId` int NOT NULL,
  `qty` int NOT NULL DEFAULT 1,
  CONSTRAINT `sample_kit_items_id` PRIMARY KEY(`id`),
  CONSTRAINT `sample_kit_items_kit_style_uq` UNIQUE(`kitId`, `styleId`)
);--> statement-breakpoint
ALTER TABLE `pricing_settings` ADD `wholesaleIncreaseRequiresApproval` boolean NOT NULL DEFAULT true;--> statement-breakpoint
ALTER TABLE `distributors` ADD `inventoryLastSyncAt` timestamp NULL;--> statement-breakpoint
ALTER TABLE `distributors` ADD `inventoryLastSyncSource` varchar(16);--> statement-breakpoint
ALTER TABLE `distributor_skus` ADD `leadTimeDays` int;--> statement-breakpoint
ALTER TABLE `distributor_skus` ADD `inventoryNotes` varchar(512);--> statement-breakpoint
ALTER TABLE `distributor_skus` ADD `discontinued` boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE `distributor_skus` ADD `backorder` boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE `distributor_skus` ADD `minimumOrderQty` int;--> statement-breakpoint
ALTER TABLE `distributor_skus` ADD `restockDate` varchar(10);--> statement-breakpoint
ALTER TABLE `distributor_skus` ADD `outOfStock` boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE `distributor_skus` ADD `inventoryUpdatedAt` timestamp NULL;--> statement-breakpoint
ALTER TABLE `distributor_skus` ADD `inventorySyncSource` varchar(16);--> statement-breakpoint
ALTER TABLE `distributor_skus` ADD `importLockedFields` json;--> statement-breakpoint
ALTER TABLE `distributor_skus` ADD `vendorWholesale` decimal(10,2);--> statement-breakpoint
ALTER TABLE `vendor_products` ADD `vendorWholesale` decimal(10,2);--> statement-breakpoint
ALTER TABLE `vendor_products` ADD `onHandQty` int;--> statement-breakpoint
ALTER TABLE `vendor_products` ADD `leadTimeDays` int;--> statement-breakpoint
ALTER TABLE `vendor_products` ADD `inventoryNotes` varchar(512);--> statement-breakpoint
ALTER TABLE `vendor_products` ADD `discontinued` boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE `vendor_products` ADD `backorder` boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE `vendor_products` ADD `minimumOrderQty` int;--> statement-breakpoint
ALTER TABLE `vendor_products` ADD `restockDate` varchar(10);--> statement-breakpoint
ALTER TABLE `vendor_products` ADD `outOfStock` boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE `vendor_products` ADD `inventoryUpdatedAt` timestamp NULL;--> statement-breakpoint
ALTER TABLE `vendor_products` ADD `inventorySyncSource` varchar(16);--> statement-breakpoint
ALTER TABLE `vendor_products` ADD `importLockedFields` json;--> statement-breakpoint
ALTER TABLE `pelican_products` ADD `vendorWholesale` decimal(10,2);--> statement-breakpoint
ALTER TABLE `pelican_products` ADD `onHandQty` int;--> statement-breakpoint
ALTER TABLE `pelican_products` ADD `leadTimeDays` int;--> statement-breakpoint
ALTER TABLE `pelican_products` ADD `inventoryNotes` varchar(512);--> statement-breakpoint
ALTER TABLE `pelican_products` ADD `discontinued` boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE `pelican_products` ADD `backorder` boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE `pelican_products` ADD `minimumOrderQty` int;--> statement-breakpoint
ALTER TABLE `pelican_products` ADD `restockDate` varchar(10);--> statement-breakpoint
ALTER TABLE `pelican_products` ADD `outOfStock` boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE `pelican_products` ADD `inventoryUpdatedAt` timestamp NULL;--> statement-breakpoint
ALTER TABLE `pelican_products` ADD `inventorySyncSource` varchar(16);--> statement-breakpoint
ALTER TABLE `pelican_products` ADD `importLockedFields` json;--> statement-breakpoint
ALTER TABLE `kitchen_designs` ADD `trimSettings` json;--> statement-breakpoint
ALTER TABLE `order_requests` ADD `orderKind` varchar(16) NOT NULL DEFAULT 'standard';--> statement-breakpoint
ALTER TABLE `order_requests` ADD `projectLabel` varchar(256);