ALTER TABLE `distributors` ADD `orderEmail` varchar(320);--> statement-breakpoint
ALTER TABLE `distributors` ADD `ccEmails` varchar(1024);--> statement-breakpoint
ALTER TABLE `distributors` ADD `fulfillmentMode` enum('email','netsuite_email','netsuite_api') DEFAULT 'email' NOT NULL;--> statement-breakpoint
ALTER TABLE `distributors` ADD `netsuiteAccountId` varchar(64);--> statement-breakpoint
ALTER TABLE `distributors` ADD `pickupEnabled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `distributors` ADD `pickupZip` varchar(16);--> statement-breakpoint
ALTER TABLE `distributors` ADD `pickupAddress` varchar(512);--> statement-breakpoint
ALTER TABLE `distributors` ADD `pickupRadiusMiles` int DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE `order_requests` ADD `deliveryMethod` enum('ship','pickup') DEFAULT 'ship' NOT NULL;--> statement-breakpoint
ALTER TABLE `order_requests` ADD `distributorId` int;--> statement-breakpoint
ALTER TABLE `order_requests` ADD `sentToDistributorAt` timestamp;--> statement-breakpoint
ALTER TABLE `order_requests` ADD `sentToDistributorEmail` varchar(1024);