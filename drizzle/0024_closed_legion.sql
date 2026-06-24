CREATE TABLE `affiliate_payouts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`affiliateId` int NOT NULL,
	`weekKey` varchar(12) NOT NULL,
	`weekStart` timestamp NOT NULL,
	`amountCents` int NOT NULL,
	`orderCount` int NOT NULL DEFAULT 0,
	`status` enum('pending','issued','paid') NOT NULL DEFAULT 'pending',
	`method` varchar(32),
	`reference` varchar(128),
	`note` text,
	`issuedAt` timestamp,
	`paidAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `affiliate_payouts_id` PRIMARY KEY(`id`)
);
