CREATE TABLE `product_views` (
	`id` int AUTO_INCREMENT NOT NULL,
	`distributorId` int NOT NULL,
	`cabinetId` int,
	`skuId` int,
	`pelicanProductId` int,
	`pageSlug` varchar(256) NOT NULL,
	`referrer` varchar(512),
	`userAgent` varchar(512),
	`viewedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `product_views_id` PRIMARY KEY(`id`)
);
