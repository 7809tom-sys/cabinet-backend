CREATE TABLE `cost_change_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`skuId` int NOT NULL,
	`cabinetId` int NOT NULL,
	`masterCode` varchar(64) NOT NULL,
	`field` varchar(32) NOT NULL,
	`oldValue` varchar(32),
	`newValue` varchar(32),
	`changedByOpenId` varchar(64),
	`changedByName` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cost_change_log_id` PRIMARY KEY(`id`)
);
