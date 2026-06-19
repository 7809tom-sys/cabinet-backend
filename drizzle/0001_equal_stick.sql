CREATE TABLE `cabinets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`masterCode` varchar(64) NOT NULL,
	`description` text NOT NULL,
	`descriptionSource` varchar(64),
	`category` varchar(64) NOT NULL,
	`subCategory` varchar(128),
	`width` decimal(6,2),
	`height` decimal(6,2),
	`depth` decimal(6,2),
	`physicalWidth` decimal(6,2),
	`weight` decimal(8,2),
	`placementType` varchar(32),
	`numberOfDoors` int DEFAULT 0,
	`numberOfDrawers` int DEFAULT 0,
	`hingeSide` varchar(16),
	`doorSwingClearance` decimal(5,2),
	`toeKickHeight` decimal(5,2),
	`stackingAllowed` boolean DEFAULT false,
	`isCornerCabinet` boolean DEFAULT false,
	`cornerSide` varchar(16),
	`fillerRequired` boolean DEFAULT false,
	`openingWidth` decimal(5,2),
	`minPull` decimal(5,2),
	`maxPull` decimal(5,2),
	`graphicType` varchar(64),
	`pkgLength` decimal(6,2),
	`pkgWidth` decimal(6,2),
	`pkgHeight` decimal(6,2),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cabinets_id` PRIMARY KEY(`id`),
	CONSTRAINT `cabinets_masterCode_unique` UNIQUE(`masterCode`)
);
--> statement-breakpoint
CREATE TABLE `cart_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cartId` int NOT NULL,
	`cabinetId` int NOT NULL,
	`platformSku` varchar(128),
	`quantity` int NOT NULL DEFAULT 1,
	`unitPrice` decimal(10,2),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cart_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `carts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`sessionId` varchar(128),
	`selectedStyleId` int,
	`selectedDistributorId` int,
	`pricingTier` enum('Wholesale','Contractor','Homeowner') NOT NULL DEFAULT 'Homeowner',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `carts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `distributor_skus` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cabinetId` int NOT NULL,
	`distributorId` int NOT NULL,
	`styleId` int NOT NULL,
	`platformSku` varchar(128) NOT NULL,
	`distributorSku` varchar(128) NOT NULL,
	`listPrice` decimal(10,2),
	`yourCost` decimal(10,2),
	`adjustedListPrice` decimal(10,2),
	`wholesalePrice` decimal(10,2),
	`contractorPrice` decimal(10,2),
	`homeownerPrice` decimal(10,2),
	`isAvailable` boolean NOT NULL DEFAULT true,
	`isPublished` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `distributor_skus_id` PRIMARY KEY(`id`),
	CONSTRAINT `distributor_skus_platformSku_unique` UNIQUE(`platformSku`)
);
--> statement-breakpoint
CREATE TABLE `distributors` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(16) NOT NULL,
	`name` varchar(128) NOT NULL,
	`initials` varchar(8) NOT NULL,
	`costMultiplier` decimal(5,4) NOT NULL,
	`tariffRate` decimal(5,4) NOT NULL DEFAULT '0',
	`shippingRate` decimal(5,4) NOT NULL DEFAULT '0',
	`warehouseZips` json DEFAULT ('[]'),
	`leadTimeDays` int DEFAULT 7,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `distributors_id` PRIMARY KEY(`id`),
	CONSTRAINT `distributors_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `door_styles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`distributorId` int NOT NULL,
	`styleCode` varchar(32) NOT NULL,
	`ourName` varchar(128) NOT NULL,
	`distributorName` varchar(128) NOT NULL,
	`doorStyle` varchar(64),
	`woodSpecies` varchar(64),
	`finish` varchar(128),
	`color` varchar(64),
	`boxConstruction` varchar(128),
	`drawerConstruction` varchar(128),
	`hardware` varchar(128),
	`frameSize` varchar(32),
	`overlayType` varchar(64),
	`doorPanelType` varchar(64),
	`warehouseZip` varchar(16),
	`shippingRate` decimal(5,4),
	`doorSampleImageUrl` varchar(512),
	`roomSceneImageUrl` varchar(512),
	`thumbnailImageUrl` varchar(512),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `door_styles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `kitchen_designs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`name` varchar(256) NOT NULL,
	`roomData` json,
	`placedCabinets` json,
	`selectedStyleId` int,
	`selectedDistributorId` int,
	`thumbnailUrl` varchar(512),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `kitchen_designs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`cabinetId` int,
	`platformSku` varchar(128),
	`distributorSku` varchar(128),
	`description` text,
	`quantity` int NOT NULL DEFAULT 1,
	`unitPrice` decimal(10,2),
	`lineTotal` decimal(10,2),
	CONSTRAINT `order_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`orderNumber` varchar(64) NOT NULL,
	`distributorId` int,
	`styleId` int,
	`pricingTier` enum('Wholesale','Contractor','Homeowner') NOT NULL,
	`status` enum('pending','confirmed','processing','shipped','delivered','cancelled') NOT NULL DEFAULT 'pending',
	`subtotal` decimal(12,2),
	`shippingCost` decimal(10,2),
	`total` decimal(12,2),
	`notes` text,
	`sourceType` enum('manual','csv_upload','ocr_upload','design_tool') DEFAULT 'manual',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `orders_orderNumber_unique` UNIQUE(`orderNumber`)
);
--> statement-breakpoint
CREATE TABLE `pantry_bundles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`platformSku` varchar(128) NOT NULL,
	`distributorId` int NOT NULL,
	`styleId` int NOT NULL,
	`width` int NOT NULL,
	`totalHeight` int NOT NULL,
	`bottomSku` varchar(64) NOT NULL,
	`topSku` varchar(64) NOT NULL,
	`bottomListPrice` decimal(10,2),
	`topListPrice` decimal(10,2),
	`combinedListPrice` decimal(10,2),
	`adjustedListPrice` decimal(10,2),
	`wholesalePrice` decimal(10,2),
	`contractorPrice` decimal(10,2),
	`homeownerPrice` decimal(10,2),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pantry_bundles_id` PRIMARY KEY(`id`),
	CONSTRAINT `pantry_bundles_platformSku_unique` UNIQUE(`platformSku`)
);
--> statement-breakpoint
CREATE TABLE `subscribers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`businessName` varchar(256) NOT NULL,
	`subdomain` varchar(64),
	`logoUrl` varchar(512),
	`primaryColor` varchar(16),
	`subscriptionTier` enum('basic','professional','enterprise') NOT NULL DEFAULT 'basic',
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `subscribers_id` PRIMARY KEY(`id`),
	CONSTRAINT `subscribers_subdomain_unique` UNIQUE(`subdomain`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','distributor','dealer') NOT NULL DEFAULT 'user';