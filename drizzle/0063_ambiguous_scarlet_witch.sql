CREATE TABLE `qbo_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`realmId` varchar(64) NOT NULL,
	`accessToken` text NOT NULL,
	`refreshToken` text NOT NULL,
	`accessTokenExpiresAt` timestamp NOT NULL,
	`refreshTokenExpiresAt` timestamp NOT NULL,
	`environment` varchar(16) NOT NULL DEFAULT 'production',
	`connectedAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `qbo_tokens_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `order_requests` ADD `qboInvoiceId` varchar(64);--> statement-breakpoint
ALTER TABLE `order_requests` ADD `qboSyncedAt` timestamp;