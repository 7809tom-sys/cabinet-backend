ALTER TABLE `users` ADD `pricingTier` enum('homeowner','contractor','wholesale') DEFAULT 'homeowner' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `companyName` varchar(200);