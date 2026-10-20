CREATE TABLE `order_shipments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderRequestId` int NOT NULL,
	`vendorScope` varchar(32) NOT NULL,
	`status` enum('pending','shipped') NOT NULL DEFAULT 'pending',
	`carrier` varchar(64),
	`trackingNumber` varchar(128),
	`packageCount` int NOT NULL DEFAULT 1,
	`notes` varchar(1000),
	`labelPrintedAt` timestamp,
	`shippedAt` timestamp,
	`shippedByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `order_shipments_id` PRIMARY KEY(`id`),
	CONSTRAINT `order_shipments_order_scope_uq` UNIQUE(`orderRequestId`,`vendorScope`)
);
--> statement-breakpoint
CREATE INDEX `order_shipments_scope_status_idx` ON `order_shipments` (`vendorScope`,`status`);