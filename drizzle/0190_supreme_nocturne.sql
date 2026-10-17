CREATE TABLE `affiliate_hardware_commission_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderRequestId` int NOT NULL,
	`affiliateId` int NOT NULL,
	`hardwareMerchandiseCents` int NOT NULL,
	`hardwareCostCents` int NOT NULL,
	`affiliateMarkupBps` int NOT NULL,
	`commissionRateBps` int NOT NULL DEFAULT 2500,
	`commissionCents` int NOT NULL,
	`confirmedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `affiliate_hardware_commission_snapshots_id` PRIMARY KEY(`id`),
	CONSTRAINT `affiliate_hardware_commission_snapshots_order_uq` UNIQUE(`orderRequestId`)
);
--> statement-breakpoint
CREATE TABLE `hardware_shipping_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`distributorId` int NOT NULL,
	`enabled` boolean NOT NULL DEFAULT false,
	`originZip` varchar(16),
	`packageLengthIn` decimal(6,2),
	`packageWidthIn` decimal(6,2),
	`packageHeightIn` decimal(6,2),
	`packageWeightLbs` decimal(8,2),
	`maxUnitsPerPackage` int,
	`standaloneShippingCents` int,
	`sourceReference` varchar(512),
	`profileRevision` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `hardware_shipping_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `hardware_shipping_profiles_distributor_uq` UNIQUE(`distributorId`)
);
--> statement-breakpoint
ALTER TABLE `affiliates` ADD `hardwareMarkupBps` int DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `affiliate_hardware_commission_snapshots_affiliate_confirmed_idx` ON `affiliate_hardware_commission_snapshots` (`affiliateId`,`confirmedAt`);