CREATE TABLE `code_aliases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`rawCodeCanon` varchar(128) NOT NULL,
	`rawCodeSample` varchar(128) NOT NULL,
	`cabinetId` int NOT NULL,
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `code_aliases_id` PRIMARY KEY(`id`),
	CONSTRAINT `code_aliases_rawCodeCanon_unique` UNIQUE(`rawCodeCanon`)
);
