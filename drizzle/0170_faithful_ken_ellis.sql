CREATE TABLE `cabinet_code_equivalences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`codeA` varchar(64) NOT NULL,
	`codeB` varchar(64) NOT NULL,
	`family` varchar(32),
	`notes` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cabinet_code_equivalences_id` PRIMARY KEY(`id`),
	CONSTRAINT `cabinet_code_equivalences_pair_unique` UNIQUE(`codeA`,`codeB`)
);
--> statement-breakpoint
CREATE TABLE `design_missing_price_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`masterCode` varchar(64) NOT NULL,
	`cabinetId` int,
	`storeScope` varchar(160) NOT NULL DEFAULT 'owner',
	`distributorId` int NOT NULL DEFAULT 0,
	`styleId` int NOT NULL DEFAULT 0,
	`designId` int NOT NULL DEFAULT 0,
	`userId` int,
	`triedCodes` text,
	`alternativeAvailable` boolean,
	`hitCount` int NOT NULL DEFAULT 1,
	`firstSeenAt` timestamp NOT NULL DEFAULT (now()),
	`lastSeenAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`resolvedAt` timestamp,
	`resolvedBy` int,
	CONSTRAINT `design_missing_price_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `design_missing_price_events_hit_unique` UNIQUE(`masterCode`,`storeScope`,`distributorId`,`styleId`,`designId`)
);
--> statement-breakpoint
CREATE INDEX `design_missing_price_events_open_idx` ON `design_missing_price_events` (`resolvedAt`,`lastSeenAt`);