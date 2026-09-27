CREATE TABLE `vendor_products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`distributorId` int NOT NULL,
	`vendorSku` varchar(128) NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`category` varchar(128),
	`listPrice` decimal(10,2),
	`yourCost` decimal(10,2),
	`imageUrl` varchar(512),
	`pkgLength` decimal(6,2),
	`pkgWidth` decimal(6,2),
	`pkgHeight` decimal(6,2),
	`pkgWeight` decimal(8,2),
	`isAvailable` boolean NOT NULL DEFAULT true,
	`status` enum('approved','pending','rejected') NOT NULL DEFAULT 'pending',
	`isPublished` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vendor_products_id` PRIMARY KEY(`id`),
	CONSTRAINT `vendor_products_line_sku_uq` UNIQUE(`distributorId`,`vendorSku`)
);
--> statement-breakpoint
ALTER TABLE `distributor_skus` ADD `supplierDescription` text;--> statement-breakpoint
ALTER TABLE `distributor_skus` ADD `pkgLength` decimal(6,2);--> statement-breakpoint
ALTER TABLE `distributor_skus` ADD `pkgWidth` decimal(6,2);--> statement-breakpoint
ALTER TABLE `distributor_skus` ADD `pkgHeight` decimal(6,2);--> statement-breakpoint
ALTER TABLE `distributor_skus` ADD `pkgWeight` decimal(8,2);--> statement-breakpoint
CREATE INDEX `vendor_products_line_status_idx` ON `vendor_products` (`distributorId`,`status`);