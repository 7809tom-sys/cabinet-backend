CREATE TABLE `categorization_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`patternType` varchar(32) NOT NULL,
	`pattern` varchar(128) NOT NULL,
	`targetCategory` varchar(64) NOT NULL,
	`confidence` int NOT NULL DEFAULT 1,
	`sourceCabinetId` int,
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `categorization_rules_id` PRIMARY KEY(`id`)
);
