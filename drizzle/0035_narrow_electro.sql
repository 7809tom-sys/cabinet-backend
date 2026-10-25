ALTER TABLE `cabinets` ADD `priceVerified` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `cabinets` ADD `priceVerifiedAt` timestamp;--> statement-breakpoint
ALTER TABLE `cabinets` ADD `priceVerifiedByName` varchar(128);