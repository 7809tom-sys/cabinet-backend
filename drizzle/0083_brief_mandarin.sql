CREATE TABLE `cabinet_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(64) NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cabinet_categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `cabinet_categories_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `cabinet_sub_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`categoryId` int NOT NULL,
	`name` varchar(128) NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cabinet_sub_categories_id` PRIMARY KEY(`id`)
);
