CREATE TABLE `affiliate_team_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`affiliateId` int NOT NULL,
	`userId` int,
	`email` varchar(320) NOT NULL,
	`name` varchar(256),
	`role` enum('salesperson','designer') NOT NULL,
	`accessCrm` boolean NOT NULL DEFAULT true,
	`accessDesigner` boolean NOT NULL DEFAULT true,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `affiliate_team_members_id` PRIMARY KEY(`id`)
);
