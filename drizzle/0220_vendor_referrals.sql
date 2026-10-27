-- Migration 0220. Journal idx 219, when 1794100000000, immediately after
-- 0219_w9_tax_id_at_rest. Snapshot prevId is the 0219 snapshot.
-- Additive only: affiliate vendor referrals.
CREATE TABLE `vendor_referrals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`affiliateId` int NOT NULL,
	`submittedByUserId` int NOT NULL,
	`vendorName` varchar(200) NOT NULL,
	`contactName` varchar(200),
	`email` varchar(320),
	`phone` varchar(32),
	`notes` text,
	`status` enum('new','contacted','onboarded','declined') NOT NULL DEFAULT 'new',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vendor_referrals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `vendor_referrals_status_created_idx` ON `vendor_referrals` (`status`,`createdAt`);
--> statement-breakpoint
CREATE INDEX `vendor_referrals_affiliate_idx` ON `vendor_referrals` (`affiliateId`);
