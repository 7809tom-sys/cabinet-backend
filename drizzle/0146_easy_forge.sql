ALTER TABLE `pelican_products` MODIFY COLUMN `unsupportedOverhangLimitIn` decimal(6,3);--> statement-breakpoint
ALTER TABLE `order_requests` ADD `freightQuoteVerified` boolean DEFAULT false NOT NULL;