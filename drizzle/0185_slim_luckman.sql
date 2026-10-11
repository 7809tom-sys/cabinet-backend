CREATE TABLE `affiliate_literature` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`category` varchar(64) NOT NULL DEFAULT 'General',
	`filename` varchar(255) NOT NULL,
	`fileKey` varchar(512) NOT NULL,
	`url` varchar(1024) NOT NULL,
	`mimeType` varchar(128) NOT NULL,
	`sizeBytes` int,
	`isPublished` boolean NOT NULL DEFAULT false,
	`sortOrder` int NOT NULL DEFAULT 0,
	`uploadedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `affiliate_literature_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `affiliate_literature_category_idx` ON `affiliate_literature` (`category`,`sortOrder`);--> statement-breakpoint
CREATE INDEX `affiliate_literature_published_idx` ON `affiliate_literature` (`isPublished`,`sortOrder`);