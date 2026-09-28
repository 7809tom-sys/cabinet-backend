ALTER TABLE `shipping_settings` ADD `upsClientId` varchar(255);--> statement-breakpoint
ALTER TABLE `shipping_settings` ADD `upsClientSecret` varchar(255);--> statement-breakpoint
ALTER TABLE `shipping_settings` ADD `upsAccountNumber` varchar(64);--> statement-breakpoint
ALTER TABLE `shipping_settings` ADD `upsEnvironment` enum('sandbox','production') DEFAULT 'sandbox';