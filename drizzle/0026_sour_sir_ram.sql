ALTER TABLE `shipping_settings` ADD `quoteMode` enum('estimator','live') DEFAULT 'estimator' NOT NULL;--> statement-breakpoint
ALTER TABLE `shipping_settings` ADD `kitchenFreightFloorCents` int DEFAULT 80000 NOT NULL;--> statement-breakpoint
ALTER TABLE `shipping_settings` ADD `kitchenMinCabinets` int DEFAULT 6 NOT NULL;--> statement-breakpoint
ALTER TABLE `shipping_settings` ADD `palletLengthIn` decimal(6,2) DEFAULT '96' NOT NULL;--> statement-breakpoint
ALTER TABLE `shipping_settings` ADD `palletWidthIn` decimal(6,2) DEFAULT '40' NOT NULL;--> statement-breakpoint
ALTER TABLE `shipping_settings` ADD `palletHeightIn` decimal(6,2) DEFAULT '60' NOT NULL;--> statement-breakpoint
ALTER TABLE `shipping_settings` ADD `palletMaxWeightLbs` decimal(8,2) DEFAULT '1200' NOT NULL;--> statement-breakpoint
ALTER TABLE `shipping_settings` ADD `palletMaxCubicFt` decimal(8,2) DEFAULT '100' NOT NULL;--> statement-breakpoint
ALTER TABLE `shipping_settings` ADD `palletTareLbs` decimal(6,2) DEFAULT '50' NOT NULL;--> statement-breakpoint
ALTER TABLE `shipping_settings` ADD `freightClass` varchar(8) DEFAULT '175' NOT NULL;--> statement-breakpoint
ALTER TABLE `shipping_settings` ADD `defaultCabinetCubicFt` decimal(6,2) DEFAULT '8' NOT NULL;