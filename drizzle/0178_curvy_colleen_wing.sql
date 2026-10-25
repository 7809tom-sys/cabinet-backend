ALTER TABLE `crm_deals` ADD `designValue` decimal(12,2);--> statement-breakpoint
ALTER TABLE `crm_deals` ADD `shippingQuote` decimal(12,2);--> statement-breakpoint
ALTER TABLE `crm_deals` ADD `shippingAddress` varchar(512);--> statement-breakpoint
ALTER TABLE `crm_deals` ADD `shippingAddressVerified` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `crm_deals` ADD `designSyncedAt` timestamp;