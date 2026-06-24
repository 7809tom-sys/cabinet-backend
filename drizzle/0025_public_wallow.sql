ALTER TABLE `affiliate_payouts` MODIFY COLUMN `weekStart` datetime NOT NULL;--> statement-breakpoint
ALTER TABLE `affiliates` ADD `taglineEs` varchar(256);--> statement-breakpoint
ALTER TABLE `affiliates` ADD `aboutTextEs` text;