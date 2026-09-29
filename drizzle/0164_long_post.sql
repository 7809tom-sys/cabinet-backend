CREATE TABLE `door_style_measurement_drafts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`styleId` int NOT NULL,
	`distributorId` int NOT NULL,
	`savedBy` int NOT NULL,
	`savedByName` varchar(255),
	`appliesToStyleIds` json NOT NULL,
	`measuredBy` varchar(255) NOT NULL DEFAULT '',
	`measuredOn` varchar(10) NOT NULL,
	`measurementData` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `door_style_measurement_drafts_id` PRIMARY KEY(`id`),
	CONSTRAINT `door_style_measurement_drafts_owner_style_idx` UNIQUE(`styleId`,`distributorId`,`savedBy`)
);
--> statement-breakpoint
CREATE INDEX `door_style_measurement_drafts_owner_idx` ON `door_style_measurement_drafts` (`savedBy`,`updatedAt`);