DROP TABLE `affiliate_banner_schedules`;--> statement-breakpoint
DROP TABLE `affiliate_promo_discounts`;--> statement-breakpoint
DROP TABLE `affiliate_room_scene_gallery`;--> statement-breakpoint
DROP TABLE `distributor_column_mappings`;--> statement-breakpoint
DROP TABLE `import_pending_skus`;--> statement-breakpoint
ALTER TABLE `media_library` DROP INDEX `media_library_fileKey_unique`;--> statement-breakpoint
ALTER TABLE `measure_sessions` MODIFY COLUMN `userId` int NOT NULL;--> statement-breakpoint
ALTER TABLE `media_library` MODIFY COLUMN `filename` varchar(255);--> statement-breakpoint
ALTER TABLE `media_library` MODIFY COLUMN `mimeType` varchar(128);--> statement-breakpoint
ALTER TABLE `orders` MODIFY COLUMN `stripeSessionId` varchar(255);--> statement-breakpoint
ALTER TABLE `orders` MODIFY COLUMN `stripePaymentIntentId` varchar(255);--> statement-breakpoint
ALTER TABLE `orders` MODIFY COLUMN `paymentStatus` enum('pending','paid','failed','refunded') DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `page_content` MODIFY COLUMN `pageKey` varchar(128) NOT NULL;--> statement-breakpoint
ALTER TABLE `page_content` MODIFY COLUMN `value` text;--> statement-breakpoint
ALTER TABLE `cabinets` ADD `roomSceneUrl` varchar(512);--> statement-breakpoint
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