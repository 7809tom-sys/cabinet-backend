CREATE TABLE `customer_favorites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`storefrontSlug` varchar(160) NOT NULL DEFAULT 'main',
	`styleId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `customer_favorites_id` PRIMARY KEY(`id`),
	CONSTRAINT `customer_favorites_user_store_style_uq` UNIQUE(`userId`,`storefrontSlug`,`styleId`)
);
--> statement-breakpoint
CREATE INDEX `customer_favorites_user_store_idx` ON `customer_favorites` (`userId`,`storefrontSlug`);