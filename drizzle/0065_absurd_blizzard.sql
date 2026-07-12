CREATE TABLE `page_content` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pageKey` varchar(64) NOT NULL,
	`field` varchar(128) NOT NULL,
	`value` text NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`updatedBy` int,
	CONSTRAINT `page_content_id` PRIMARY KEY(`id`)
);
