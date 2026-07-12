CREATE TABLE `affiliate_banner_schedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`affiliate_id` int NOT NULL,
	`message` varchar(500) NOT NULL,
	`holiday_key` varchar(64),
	`start_date` varchar(10) NOT NULL,
	`end_date` varchar(10) NOT NULL,
	`created_at` bigint NOT NULL,
	`updated_at` bigint NOT NULL,
	CONSTRAINT `affiliate_banner_schedules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `affiliate_promo_discounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`affiliateId` int NOT NULL,
	`label` varchar(256) NOT NULL,
	`targetType` enum('all','category','style') NOT NULL DEFAULT 'all',
	`targetId` varchar(64),
	`discountBps` int NOT NULL,
	`startsAt` timestamp,
	`endsAt` timestamp,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `affiliate_promo_discounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `affiliate_room_scene_gallery` (
	`id` int AUTO_INCREMENT NOT NULL,
	`affiliateId` int NOT NULL,
	`styleId` int NOT NULL,
	`imageUrl` varchar(512) NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `affiliate_room_scene_gallery_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `affiliate_style_branding` ADD `hidden` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `affiliates` ADD `heroHeadline` varchar(256);--> statement-breakpoint
ALTER TABLE `affiliates` ADD `promoBannerText` varchar(512);--> statement-breakpoint
ALTER TABLE `affiliates` ADD `promoBannerActive` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `affiliates` ADD `promoBannerImageUrl` varchar(512);--> statement-breakpoint
ALTER TABLE `affiliates` ADD `address` varchar(512);--> statement-breakpoint
ALTER TABLE `affiliates` ADD `businessHours` varchar(512);--> statement-breakpoint
ALTER TABLE `affiliates` ADD `bankName` varchar(256);--> statement-breakpoint
ALTER TABLE `affiliates` ADD `bankRoutingNumber` varchar(9);--> statement-breakpoint
ALTER TABLE `affiliates` ADD `bankAccountNumber` varchar(64);--> statement-breakpoint
ALTER TABLE `affiliates` ADD `bankAccountType` enum('checking','savings');--> statement-breakpoint
ALTER TABLE `affiliates` ADD `bankVerified` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `affiliates` ADD `bankVerifiedAt` timestamp;--> statement-breakpoint
ALTER TABLE `affiliates` ADD `bankAdminNotes` text;--> statement-breakpoint
ALTER TABLE `affiliates` ADD `ssnCardUrl` varchar(512);--> statement-breakpoint
ALTER TABLE `affiliates` ADD `dlFrontUrl` varchar(512);--> statement-breakpoint
ALTER TABLE `affiliates` ADD `dlBackUrl` varchar(512);--> statement-breakpoint
ALTER TABLE `affiliates` ADD `idVerified` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `affiliates` ADD `idVerifiedAt` timestamp;--> statement-breakpoint
ALTER TABLE `affiliates` ADD `idAdminNotes` text;--> statement-breakpoint
ALTER TABLE `affiliates` ADD `payoutConsentSigned` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `affiliates` ADD `payoutConsentSignedAt` timestamp;--> statement-breakpoint
ALTER TABLE `affiliates` ADD `payoutConsentIp` varchar(64);--> statement-breakpoint
ALTER TABLE `affiliates` ADD `payoutConsentName` varchar(256);--> statement-breakpoint
ALTER TABLE `affiliates` ADD `payoutReady` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `affiliates` ADD `payoutReadyAt` timestamp;--> statement-breakpoint
ALTER TABLE `distributor_skus` ADD `availableWarehouses` json;