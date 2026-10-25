ALTER TABLE `affiliates` ADD `setupToken` varchar(96);--> statement-breakpoint
ALTER TABLE `affiliates` ADD `setupTokenCreatedAt` timestamp;--> statement-breakpoint
ALTER TABLE `affiliates` ADD CONSTRAINT `affiliates_setupToken_unique` UNIQUE(`setupToken`);