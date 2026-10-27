-- Admin order cost snapshots and the paid-order receipt marker.
-- The owner applies the TiDB editor statements in
-- docs/sql/0224_order_admin_reconciliation.tidb.sql by hand.
ALTER TABLE `order_requests` ADD COLUMN IF NOT EXISTS `receiptSentAt` timestamp NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `order_request_line_costs` (
  `id` int AUTO_INCREMENT NOT NULL,
  `orderRequestId` int NOT NULL,
  `lineIndex` int NOT NULL,
  `sku` varchar(128),
  `itemCode` varchar(128),
  `unitDistributorCost` decimal(10,2),
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `order_request_line_costs_id` PRIMARY KEY(`id`),
  CONSTRAINT `order_request_line_costs_order_line_uq` UNIQUE(`orderRequestId`,`lineIndex`)
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `order_request_commerce_snapshots` (
  `id` int AUTO_INCREMENT NOT NULL,
  `orderRequestId` int NOT NULL,
  `shippingCarrier` varchar(120),
  `shippingService` varchar(160),
  `discountAmount` decimal(12,2),
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `order_request_commerce_snapshots_id` PRIMARY KEY(`id`),
  CONSTRAINT `order_request_commerce_snapshots_order_uq` UNIQUE(`orderRequestId`)
);
