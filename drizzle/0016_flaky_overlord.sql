CREATE TABLE `freight_zones` (
	`id` int AUTO_INCREMENT NOT NULL,
	`zoneName` varchar(64) NOT NULL,
	`zipPrefixes` varchar(255) NOT NULL,
	`rateCents` int NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `freight_zones_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `shipping_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`originZip` varchar(16) NOT NULL DEFAULT '',
	`rateModel` enum('per_cwt','flat') NOT NULL DEFAULT 'per_cwt',
	`handlingFeeCents` int NOT NULL DEFAULT 0,
	`minChargeCents` int NOT NULL DEFAULT 8900,
	`liftgateFeeCents` int NOT NULL DEFAULT 7500,
	`residentialFeeCents` int NOT NULL DEFAULT 6500,
	`insideDeliveryFeeCents` int NOT NULL DEFAULT 5000,
	`markupBps` int NOT NULL DEFAULT 1500,
	`damageFeeBps` int NOT NULL DEFAULT 0,
	`freeFreightThresholdCents` int NOT NULL DEFAULT 0,
	`defaultCabinetWeightLbs` decimal(6,2) NOT NULL DEFAULT '45',
	`liveProvider` varchar(64) NOT NULL DEFAULT 'estimator',
	`liveApiKey` varchar(255),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `shipping_settings_id` PRIMARY KEY(`id`)
);
