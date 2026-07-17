ALTER TABLE `orders` ADD `stripeSessionId` varchar(256);--> statement-breakpoint
ALTER TABLE `orders` ADD `stripePaymentIntentId` varchar(256);--> statement-breakpoint
ALTER TABLE `orders` ADD `paymentStatus` enum('unpaid','paid','refunded') DEFAULT 'unpaid' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `paidAt` timestamp;