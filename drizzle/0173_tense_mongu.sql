ALTER TABLE `affiliate_installation_estimates` ADD `roomType` enum('Kitchen','Bathroom','Laundry','Closets') DEFAULT 'Kitchen' NOT NULL;--> statement-breakpoint
ALTER TABLE `affiliate_installation_estimates` ADD `markupPercent` decimal(7,2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE `affiliate_installation_estimates` ADD `markupAmount` decimal(12,2) DEFAULT '0.00' NOT NULL;
