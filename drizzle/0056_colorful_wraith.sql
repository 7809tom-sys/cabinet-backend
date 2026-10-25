CREATE TABLE `product_gallery_images` (
	`id` int AUTO_INCREMENT NOT NULL,
	`skuId` int NOT NULL,
	`distributorId` int NOT NULL,
	`s3Key` varchar(512) NOT NULL,
	`s3Url` varchar(1024) NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	`caption` varchar(256),
	`uploadedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `product_gallery_images_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vendor_promotions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`distributorId` int NOT NULL,
	`name` varchar(256) NOT NULL,
	`skuIds` json,
	`styleId` int,
	`category` varchar(128),
	`discountType` enum('percent','fixed_price') NOT NULL,
	`discountValue` decimal(10,2) NOT NULL,
	`startsAt` timestamp,
	`endsAt` timestamp,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vendor_promotions_id` PRIMARY KEY(`id`)
);
