CREATE TABLE `affiliate_testimonials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`affiliateId` int NOT NULL,
	`quote` text NOT NULL,
	`author` varchar(160),
	`sourceUrl` varchar(512) NOT NULL,
	`isPublished` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `affiliate_testimonials_id` PRIMARY KEY(`id`)
);
