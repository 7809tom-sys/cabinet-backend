CREATE TABLE `pelican_shipping_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pelicanProductId` int NOT NULL,
	`originName` varchar(191) NOT NULL,
	`originZip` varchar(16) NOT NULL,
	`transportMode` enum('parcel','ltl') NOT NULL,
	`packageLengthIn` decimal(8,2) NOT NULL,
	`packageWidthIn` decimal(8,2) NOT NULL,
	`packageHeightIn` decimal(8,2) NOT NULL,
	`packageWeightLbs` decimal(8,2) NOT NULL,
	`freightClass` varchar(8),
	`sourceUrl` varchar(512) NOT NULL,
	`sourceReference` varchar(512) NOT NULL,
	`verifiedAt` timestamp NOT NULL,
	`isEnabled` boolean NOT NULL DEFAULT false,
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pelican_shipping_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `pelican_shipping_profiles_product_uidx` UNIQUE(`pelicanProductId`)
);
