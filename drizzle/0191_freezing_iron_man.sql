ALTER TABLE `vendor_products` ADD `hardwareCollection` varchar(128);--> statement-breakpoint
ALTER TABLE `vendor_products` ADD `hardwareProductType` varchar(128);--> statement-breakpoint
ALTER TABLE `vendor_products` ADD `hardwareFinish` varchar(128);--> statement-breakpoint
ALTER TABLE `vendor_products` ADD `hardwareConfigurationKey` varchar(128);--> statement-breakpoint
ALTER TABLE `vendor_products` ADD `hardwareConfigurationLabel` varchar(512);--> statement-breakpoint
CREATE INDEX `vendor_products_hardware_configuration_idx` ON `vendor_products` (`distributorId`,`hardwareCollection`,`hardwareProductType`,`hardwareConfigurationKey`);