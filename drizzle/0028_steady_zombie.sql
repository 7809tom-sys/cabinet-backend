CREATE TABLE `payment_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`provider` varchar(32) NOT NULL DEFAULT 'authorizenet',
	`enabled` boolean NOT NULL DEFAULT false,
	`environment` enum('sandbox','production') NOT NULL DEFAULT 'sandbox',
	`apiLoginId` varchar(64),
	`transactionKey` varchar(64),
	`clientKey` varchar(128),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`updatedByOpenId` varchar(64),
	CONSTRAINT `payment_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderRequestId` int NOT NULL,
	`requestNumber` varchar(64) NOT NULL,
	`provider` varchar(32) NOT NULL DEFAULT 'authorizenet',
	`environment` enum('sandbox','production') NOT NULL DEFAULT 'sandbox',
	`status` enum('pending','approved','declined','error','refunded') NOT NULL DEFAULT 'pending',
	`amountCents` int NOT NULL,
	`merchandiseCents` int NOT NULL DEFAULT 0,
	`feesCents` int NOT NULL DEFAULT 0,
	`freightCents` int NOT NULL DEFAULT 0,
	`transactionId` varchar(64),
	`authCode` varchar(32),
	`responseCode` varchar(8),
	`avsResultCode` varchar(8),
	`cardLast4` varchar(4),
	`cardType` varchar(24),
	`message` text,
	`payerName` varchar(256),
	`payerEmail` varchar(320),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `payments_id` PRIMARY KEY(`id`)
);
