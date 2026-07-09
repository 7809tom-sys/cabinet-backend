ALTER TABLE `order_requests` ADD `taxState` varchar(2);--> statement-breakpoint
ALTER TABLE `order_requests` ADD `taxRate` decimal(7,6);--> statement-breakpoint
ALTER TABLE `order_requests` ADD `taxAmount` decimal(12,2);