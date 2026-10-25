CREATE TABLE `pricing_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`globalMarkupBps` int NOT NULL DEFAULT 10000,
	`homeownerMarkupBps` int NOT NULL DEFAULT 10000,
	`contractorMarkupBps` int NOT NULL DEFAULT 10000,
	`wholesaleMarkupBps` int NOT NULL DEFAULT 10000,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`updatedByOpenId` varchar(64),
	CONSTRAINT `pricing_settings_id` PRIMARY KEY(`id`)
);
