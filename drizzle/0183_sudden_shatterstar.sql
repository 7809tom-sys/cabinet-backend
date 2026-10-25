CREATE TABLE `design_view_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`designId` int NOT NULL,
	`dealId` int,
	`viewerUserId` int,
	`viewerName` varchar(256),
	`viewerKind` varchar(32) NOT NULL DEFAULT 'owner',
	`viewedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `design_view_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `freight_quote_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`broker` varchar(40) NOT NULL,
	`environment` varchar(20),
	`fromZip` varchar(12) NOT NULL,
	`toZip` varchar(12) NOT NULL,
	`palletCount` int NOT NULL DEFAULT 0,
	`totalWeightLbs` decimal(10,2) NOT NULL DEFAULT '0',
	`freightClass` varchar(20),
	`accessorials` text,
	`ok` boolean NOT NULL DEFAULT false,
	`amountCents` int NOT NULL DEFAULT 0,
	`carrier` varchar(120),
	`service` varchar(160),
	`error` text,
	`durationMs` int,
	`packagesJson` text,
	CONSTRAINT `freight_quote_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `shipping_settings` ADD `fedexClientId` varchar(255);--> statement-breakpoint
ALTER TABLE `shipping_settings` ADD `fedexClientSecret` varchar(255);--> statement-breakpoint
ALTER TABLE `shipping_settings` ADD `fedexAccountNumber` varchar(64);--> statement-breakpoint
ALTER TABLE `shipping_settings` ADD `fedexEnvironment` enum('sandbox','production') DEFAULT 'sandbox';--> statement-breakpoint
ALTER TABLE `affiliate_featured_distributor_events` ADD `styleId` int;