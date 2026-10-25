CREATE TABLE `affiliate_style_branding` (
	`id` int AUTO_INCREMENT NOT NULL,
	`affiliateId` int NOT NULL,
	`styleId` int NOT NULL,
	`brandName` varchar(256),
	`markupBps` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `affiliate_style_branding_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `affiliates` ADD `defaultMarkupBps` int DEFAULT 2000 NOT NULL;--> statement-breakpoint
ALTER TABLE `affiliates` ADD `categoryMarkupJson` text;