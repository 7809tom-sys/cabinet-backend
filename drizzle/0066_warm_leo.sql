CREATE TABLE `distributor_column_mappings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`distributorId` int NOT NULL,
	`columnCode` varchar(32) NOT NULL,
	`doorStyleId` int NOT NULL,
	`priceType` enum('list','cost') NOT NULL DEFAULT 'list',
	`lastUsedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `distributor_column_mappings_id` PRIMARY KEY(`id`)
);
