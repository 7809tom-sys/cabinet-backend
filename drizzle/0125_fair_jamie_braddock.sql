CREATE TABLE `customer_preferred_products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`storefrontSlug` varchar(160) NOT NULL DEFAULT 'main',
	`productId` int NOT NULL,
	`category` enum('flooring','countertop','backsplash','faucet','sink') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `customer_preferred_products_id` PRIMARY KEY(`id`),
	CONSTRAINT `customer_preferred_products_user_store_product_uq` UNIQUE(`userId`,`storefrontSlug`,`productId`)
);
--> statement-breakpoint
CREATE INDEX `customer_preferred_products_user_store_category_idx` ON `customer_preferred_products` (`userId`,`storefrontSlug`,`category`);