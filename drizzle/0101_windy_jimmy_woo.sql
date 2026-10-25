CREATE TABLE `cabinet_aliases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cabinetId` int NOT NULL,
	`alias` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cabinet_aliases_id` PRIMARY KEY(`id`),
	CONSTRAINT `cabinet_aliases_alias_unique` UNIQUE(`alias`)
);
