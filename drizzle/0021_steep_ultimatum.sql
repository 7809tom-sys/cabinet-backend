CREATE TABLE `platform_pricing_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`wholesaleMarkupBps` int NOT NULL DEFAULT 1500,
	`affiliateMarkupBps` int NOT NULL DEFAULT 500,
	`retailMarkupBps` int NOT NULL DEFAULT 2500,
	`damageFeeBps` int NOT NULL DEFAULT 100,
	`techFeeBps` int NOT NULL DEFAULT 1000,
	`techFeeCapCents` int NOT NULL DEFAULT 10000,
	`cardFeeBps` int NOT NULL DEFAULT 400,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`updatedByOpenId` varchar(64),
	CONSTRAINT `platform_pricing_settings_id` PRIMARY KEY(`id`)
);
