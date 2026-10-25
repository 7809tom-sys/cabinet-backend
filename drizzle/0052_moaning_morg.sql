CREATE TABLE `crm_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventType` varchar(48) NOT NULL,
	`affiliateId` int,
	`referralCode` varchar(32),
	`dealerName` varchar(256),
	`userId` int,
	`contactName` varchar(256),
	`contactEmail` varchar(320),
	`contactPhone` varchar(32),
	`payload` json,
	`status` enum('pending','sent','failed','skipped') NOT NULL DEFAULT 'pending',
	`attempts` int NOT NULL DEFAULT 0,
	`lastError` text,
	`responseStatus` int,
	`deliveredAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `crm_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `surface_previews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerOpenId` varchar(191),
	`selections` json,
	`previewUrl` varchar(512),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `surface_previews_id` PRIMARY KEY(`id`)
);
