ALTER TABLE `shipping_settings` ADD `fqClientId` varchar(255);--> statement-breakpoint
ALTER TABLE `shipping_settings` ADD `fqClientSecret` varchar(255);--> statement-breakpoint
ALTER TABLE `shipping_settings` ADD `fqAccountNumber` varchar(64);--> statement-breakpoint
ALTER TABLE `shipping_settings` ADD `fqEnvironment` enum('sandbox','production') DEFAULT 'sandbox';--> statement-breakpoint
ALTER TABLE `shipping_settings` ADD `gtzApiKey` varchar(255);--> statement-breakpoint
ALTER TABLE `shipping_settings` ADD `gtzUsername` varchar(128);--> statement-breakpoint
ALTER TABLE `shipping_settings` ADD `gtzPassword` varchar(255);--> statement-breakpoint
ALTER TABLE `shipping_settings` ADD `gtzAccountNumber` varchar(64);--> statement-breakpoint
ALTER TABLE `shipping_settings` ADD `gtzEnvironment` enum('sandbox','production') DEFAULT 'sandbox';--> statement-breakpoint
ALTER TABLE `shipping_settings` ADD `wwexClientId` varchar(255);--> statement-breakpoint
ALTER TABLE `shipping_settings` ADD `wwexClientSecret` varchar(255);--> statement-breakpoint
ALTER TABLE `shipping_settings` ADD `wwexAccountNumber` varchar(64);--> statement-breakpoint
ALTER TABLE `shipping_settings` ADD `wwexUsername` varchar(128);--> statement-breakpoint
ALTER TABLE `shipping_settings` ADD `wwexPassword` varchar(255);--> statement-breakpoint
ALTER TABLE `shipping_settings` ADD `wwexEnvironment` enum('sandbox','production') DEFAULT 'sandbox';