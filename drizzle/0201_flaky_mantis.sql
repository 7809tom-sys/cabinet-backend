CREATE TABLE `distributor_integrations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`distributorId` int NOT NULL,
	`integrationType` enum('inventory','shipping') NOT NULL,
	`provider` varchar(64) NOT NULL,
	`displayName` varchar(128) NOT NULL,
	`baseUrl` varchar(512),
	`accountNumber` varchar(128),
	`clientId` varchar(255),
	`apiKeyEncrypted` varchar(2048),
	`clientSecretEncrypted` varchar(2048),
	`username` varchar(255),
	`passwordEncrypted` varchar(2048),
	`authHeaderName` varchar(128),
	`environment` enum('sandbox','production') NOT NULL DEFAULT 'production',
	`isEnabled` boolean NOT NULL DEFAULT false,
	`lastVerifiedAt` timestamp,
	`lastError` varchar(512),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `distributor_integrations_id` PRIMARY KEY(`id`),
	CONSTRAINT `distributor_integrations_dist_type_provider_uq` UNIQUE(`distributorId`,`integrationType`,`provider`)
);
--> statement-breakpoint
ALTER TABLE `catalog_imports` ADD `fileKey` varchar(512);--> statement-breakpoint
ALTER TABLE `catalog_imports` ADD `fileUrl` varchar(512);--> statement-breakpoint
CREATE INDEX `distributor_integrations_distributor_idx` ON `distributor_integrations` (`distributorId`);