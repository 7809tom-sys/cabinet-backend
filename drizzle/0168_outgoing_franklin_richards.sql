CREATE TABLE `cabinet_recovery_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cabinetId` int NOT NULL,
	`masterCode` varchar(64) NOT NULL,
	`reason` varchar(64) NOT NULL,
	`rowJson` text NOT NULL,
	`overridesJson` text,
	`takenBy` int,
	`takenByName` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cabinet_recovery_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `cabinet_recovery_snapshots_cabinet_idx` ON `cabinet_recovery_snapshots` (`cabinetId`,`createdAt`);