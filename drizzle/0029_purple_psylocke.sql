CREATE TABLE `design_leads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`email` varchar(320) NOT NULL,
	`name` varchar(256),
	`phone` varchar(32),
	`roomType` varchar(32),
	`source` varchar(64) NOT NULL DEFAULT 'designer_launch',
	`launchCount` int NOT NULL DEFAULT 1,
	`lastLaunchAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `design_leads_id` PRIMARY KEY(`id`)
);
