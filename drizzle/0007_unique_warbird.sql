CREATE TABLE `crm_activities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`dealId` int NOT NULL,
	`authorUserId` int,
	`kind` enum('note','call','email','meeting','stage_change','task') NOT NULL DEFAULT 'note',
	`body` text NOT NULL,
	`dueAt` timestamp,
	`done` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `crm_activities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `crm_deals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`affiliateId` int,
	`ownerUserId` int,
	`title` varchar(256) NOT NULL,
	`stage` enum('new','contacted','qualified','quoted','won','lost') NOT NULL DEFAULT 'new',
	`priority` enum('low','medium','high') NOT NULL DEFAULT 'medium',
	`contactName` varchar(256),
	`contactEmail` varchar(320),
	`contactPhone` varchar(32),
	`company` varchar(256),
	`location` varchar(256),
	`language` enum('en','es') NOT NULL DEFAULT 'en',
	`estimatedValue` decimal(12,2),
	`source` enum('manual','order_request','pro_application','storefront','referral') NOT NULL DEFAULT 'manual',
	`orderRequestId` int,
	`proApplicationId` int,
	`referralCode` varchar(32),
	`nextFollowUpAt` timestamp,
	`notes` text,
	`boardOrder` int NOT NULL DEFAULT 0,
	`closedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `crm_deals_id` PRIMARY KEY(`id`)
);
