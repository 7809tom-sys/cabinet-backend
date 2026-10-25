ALTER TABLE `order_requests` ADD `deliveryLocationType` enum('business','residential') DEFAULT 'business' NOT NULL;--> statement-breakpoint
ALTER TABLE `order_requests` ADD `liftgateRequired` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `order_requests` ADD `freightQuoteCents` int DEFAULT 0 NOT NULL;