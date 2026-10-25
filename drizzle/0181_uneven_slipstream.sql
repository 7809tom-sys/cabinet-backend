CREATE TABLE `affiliate_distributor_selections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`affiliateId` int NOT NULL,
	`distributorId` int NOT NULL,
	`featured` boolean NOT NULL DEFAULT false,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `affiliate_distributor_selections_id` PRIMARY KEY(`id`),
	CONSTRAINT `affiliate_distributor_selection_uidx` UNIQUE(`affiliateId`,`distributorId`)
);
--> statement-breakpoint
CREATE INDEX `affiliate_distributor_selection_affiliate_idx` ON `affiliate_distributor_selections` (`affiliateId`);
