CREATE TABLE `catalog_imports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`distributorId` int NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`fileSize` int,
	`status` enum('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
	`cabinetCount` int NOT NULL DEFAULT 0,
	`skuCount` int NOT NULL DEFAULT 0,
	`imageCount` int NOT NULL DEFAULT 0,
	`errorLog` text,
	`preservePricing` boolean NOT NULL DEFAULT true,
	`isRollbackable` boolean NOT NULL DEFAULT true,
	`uploadedAt` timestamp NOT NULL DEFAULT (now()),
	`importStartedAt` timestamp,
	`importCompletedAt` timestamp,
	`uploadedByUserId` int,
	`uploadedByName` varchar(128),
	CONSTRAINT `catalog_imports_id` PRIMARY KEY(`id`)
);
