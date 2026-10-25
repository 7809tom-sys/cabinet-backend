ALTER TABLE `order_requests` ADD `stripeSessionId` varchar(255);--> statement-breakpoint
ALTER TABLE `order_requests` ADD `stripePaymentIntentId` varchar(255);--> statement-breakpoint
ALTER TABLE `order_requests` ADD `paidAt` timestamp;--> statement-breakpoint
ALTER TABLE `order_requests` ADD CONSTRAINT `order_requests_stripe_session_uq` UNIQUE(`stripeSessionId`);