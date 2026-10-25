CREATE TABLE `price_shop_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`layoutType` varchar(32) NOT NULL DEFAULT '10x10',
	`snapshotData` json NOT NULL,
	`totalStyles` int NOT NULL DEFAULT 0,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `price_shop_snapshots_id` PRIMARY KEY(`id`)
);
