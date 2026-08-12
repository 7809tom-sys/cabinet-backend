CREATE TABLE `customer_favorite_syncs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`storefrontSlug` varchar(160) NOT NULL DEFAULT 'main',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customer_favorite_syncs_id` PRIMARY KEY(`id`),
	CONSTRAINT `customer_favorite_syncs_user_store_uq` UNIQUE(`userId`,`storefrontSlug`)
);
