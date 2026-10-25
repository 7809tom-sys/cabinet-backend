CREATE TABLE `affiliate_installation_estimates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`affiliateId` int NOT NULL,
	`orderRequestId` int,
	`customerName` varchar(256),
	`customerEmail` varchar(320),
	`customerPhone` varchar(32),
	`status` enum('draft','shared','accepted','cancelled') NOT NULL DEFAULT 'draft',
	`lineItems` json NOT NULL,
	`subtotal` decimal(12,2) NOT NULL,
	`taxAmount` decimal(12,2) NOT NULL DEFAULT '0.00',
	`totalAmount` decimal(12,2) NOT NULL,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `affiliate_installation_estimates_id` PRIMARY KEY(`id`)
);
