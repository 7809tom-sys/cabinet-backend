CREATE TABLE `distributor_integration_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`integrationId` int NOT NULL,
	`distributorId` int NOT NULL,
	`eventType` varchar(32) NOT NULL,
	`status` varchar(16) NOT NULL,
	`message` varchar(512),
	`responseMs` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `distributor_integration_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `shipping_settings` ADD `warehouseTemplateZips` json;--> statement-breakpoint
CREATE INDEX `distributor_integration_events_integration_idx` ON `distributor_integration_events` (`integrationId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `distributor_integration_events_distributor_idx` ON `distributor_integration_events` (`distributorId`,`createdAt`);