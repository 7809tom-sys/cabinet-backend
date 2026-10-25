ALTER TABLE `distributors` ADD `warehouseName` varchar(128);--> statement-breakpoint
ALTER TABLE `distributors` ADD `warehouseAddress` varchar(512);--> statement-breakpoint
ALTER TABLE `distributors` ADD `shippingRuleMode` enum('live','fixed','threshold') DEFAULT 'live' NOT NULL;--> statement-breakpoint
ALTER TABLE `distributors` ADD `shippingFlatFreightFeeCents` int;--> statement-breakpoint
ALTER TABLE `distributors` ADD `shippingFreeFreightThresholdCents` int;--> statement-breakpoint
ALTER TABLE `distributors` ADD `shippingZipRates` json;--> statement-breakpoint
ALTER TABLE `distributors` ADD `shippingExceptions` text;