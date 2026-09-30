CREATE TABLE `cabinet_config_change_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cabinetId` int NOT NULL,
	`masterCode` varchar(64) NOT NULL,
	`scope` enum('master','distributor') NOT NULL,
	`distributorId` int,
	`field` varchar(64) NOT NULL,
	`oldValueJson` text,
	`newValueJson` text,
	`changedBy` int,
	`changedByName` varchar(128),
	`revertedAt` timestamp,
	`revertedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cabinet_config_change_log_id` PRIMARY KEY(`id`)
);
