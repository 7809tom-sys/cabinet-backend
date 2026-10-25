CREATE TABLE `affiliate_invoices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`affiliateId` int NOT NULL,
	`invoiceNumber` varchar(32) NOT NULL,
	`description` varchar(256) NOT NULL DEFAULT 'Annual affiliate membership',
	`amountCents` int NOT NULL DEFAULT 119500,
	`status` enum('open','paid','void') NOT NULL DEFAULT 'open',
	`paymentMethod` enum('stripe','external_card','manual','none') NOT NULL DEFAULT 'none',
	`paymentRef` varchar(256),
	`periodStart` timestamp,
	`periodEnd` timestamp,
	`issuedAt` timestamp NOT NULL DEFAULT (now()),
	`paidAt` timestamp,
	`paidByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `affiliate_invoices_id` PRIMARY KEY(`id`),
	CONSTRAINT `affiliate_invoices_invoiceNumber_unique` UNIQUE(`invoiceNumber`)
);
--> statement-breakpoint
CREATE TABLE `design_consultations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slotId` int NOT NULL,
	`designerUserId` int NOT NULL,
	`designerName` varchar(256),
	`customerUserId` int,
	`customerName` varchar(256) NOT NULL,
	`customerEmail` varchar(320) NOT NULL,
	`customerPhone` varchar(32),
	`designId` int,
	`designName` varchar(256),
	`startAt` timestamp NOT NULL,
	`endAt` timestamp NOT NULL,
	`mode` enum('video','phone','in_person') NOT NULL DEFAULT 'video',
	`topic` varchar(1000),
	`status` enum('requested','confirmed','completed','cancelled') NOT NULL DEFAULT 'requested',
	`dealId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `design_consultations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `designer_availability` (
	`id` int AUTO_INCREMENT NOT NULL,
	`designerUserId` int NOT NULL,
	`designerName` varchar(256),
	`startAt` timestamp NOT NULL,
	`endAt` timestamp NOT NULL,
	`mode` enum('video','phone','in_person') NOT NULL DEFAULT 'video',
	`status` enum('open','booked','blocked') NOT NULL DEFAULT 'open',
	`notes` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `designer_availability_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sales_commissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`dealId` int NOT NULL,
	`repUserId` int NOT NULL,
	`repName` varchar(256),
	`amountCents` int NOT NULL DEFAULT 40000,
	`status` enum('pending','paid','void') NOT NULL DEFAULT 'pending',
	`dealTitle` varchar(256),
	`wonAt` timestamp NOT NULL DEFAULT (now()),
	`paidAt` timestamp,
	`paidByUserId` int,
	`notes` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sales_commissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `sales_commissions_dealId_unique` UNIQUE(`dealId`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','distributor','dealer','partner','designer','sales_rep') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `affiliates` ADD `membershipStatus` enum('pending','active','past_due','cancelled') DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `affiliates` ADD `membershipFeeCents` int DEFAULT 119500 NOT NULL;--> statement-breakpoint
ALTER TABLE `affiliates` ADD `membershipPaidAt` timestamp;--> statement-breakpoint
ALTER TABLE `affiliates` ADD `membershipExpiresAt` timestamp;