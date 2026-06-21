CREATE TABLE `affiliates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeName` varchar(256) NOT NULL,
	`slug` varchar(64) NOT NULL,
	`contactName` varchar(256),
	`email` varchar(320) NOT NULL,
	`phone` varchar(32),
	`website` varchar(512),
	`location` varchar(256),
	`referralCode` varchar(32) NOT NULL,
	`commissionRate` decimal(5,4) NOT NULL DEFAULT '0.05',
	`status` enum('active','paused','inactive') NOT NULL DEFAULT 'active',
	`userId` int,
	`logoUrl` varchar(512),
	`primaryColor` varchar(16),
	`accentColor` varchar(16),
	`heroImageUrl` varchar(512),
	`tagline` varchar(256),
	`aboutText` text,
	`serviceArea` varchar(256),
	`yearsInBusiness` int,
	`facebookUrl` varchar(512),
	`instagramUrl` varchar(512),
	`storefrontEnabled` boolean NOT NULL DEFAULT true,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `affiliates_id` PRIMARY KEY(`id`),
	CONSTRAINT `affiliates_slug_unique` UNIQUE(`slug`),
	CONSTRAINT `affiliates_referralCode_unique` UNIQUE(`referralCode`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','distributor','dealer','partner') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `order_requests` ADD `affiliateId` int;--> statement-breakpoint
ALTER TABLE `order_requests` ADD `referralCode` varchar(32);