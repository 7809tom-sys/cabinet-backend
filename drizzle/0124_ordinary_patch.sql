CREATE TABLE `cabinet_distributor_eligibility` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cabinetId` int NOT NULL,
	`distributorId` int NOT NULL,
	`source` varchar(64) NOT NULL DEFAULT 'Distributor catalog import',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cabinet_distributor_eligibility_id` PRIMARY KEY(`id`),
	CONSTRAINT `cabinet_distributor_eligibility_unique` UNIQUE(`cabinetId`,`distributorId`)
);
--> statement-breakpoint
CREATE INDEX `cabinet_distributor_eligibility_cabinet_idx` ON `cabinet_distributor_eligibility` (`cabinetId`);--> statement-breakpoint
CREATE INDEX `cabinet_distributor_eligibility_distributor_idx` ON `cabinet_distributor_eligibility` (`distributorId`);