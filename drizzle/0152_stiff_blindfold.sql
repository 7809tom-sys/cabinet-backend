ALTER TABLE `order_requests` ADD `orderRailStatus` enum('awaiting_payment','affiliate_review','distributor_inventory_check','affiliate_invoice_review','fulfillment_authorized') DEFAULT 'awaiting_payment' NOT NULL;--> statement-breakpoint
ALTER TABLE `order_requests` ADD `affiliateReviewedAt` timestamp;--> statement-breakpoint
ALTER TABLE `order_requests` ADD `affiliateReviewedByUserId` int;--> statement-breakpoint
ALTER TABLE `order_requests` ADD `distributorInventoryConfirmedAt` timestamp;--> statement-breakpoint
ALTER TABLE `order_requests` ADD `distributorInvoiceReference` varchar(128);--> statement-breakpoint
ALTER TABLE `order_requests` ADD `distributorInvoiceAmount` decimal(12,2);--> statement-breakpoint
ALTER TABLE `order_requests` ADD `distributorInvoiceNotes` text;--> statement-breakpoint
ALTER TABLE `order_requests` ADD `distributorInvoiceReceivedAt` timestamp;--> statement-breakpoint
ALTER TABLE `order_requests` ADD `affiliateInvoiceApprovedAt` timestamp;--> statement-breakpoint
ALTER TABLE `order_requests` ADD `affiliateInvoiceApprovedByUserId` int;--> statement-breakpoint
ALTER TABLE `order_requests` ADD `fulfillmentAuthorizedAt` timestamp;
--> statement-breakpoint
UPDATE `order_requests`
SET `orderRailStatus` = 'affiliate_review'
WHERE `status` = 'confirmed' AND `stripePaymentIntentId` IS NOT NULL;
