CREATE TABLE `stripe_payment_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`livemode` boolean NOT NULL DEFAULT false,
	`stripeMode` enum('live','test') NOT NULL,
	`checkoutSessionId` varchar(255),
	`paymentIntentId` varchar(255),
	`chargeId` varchar(255),
	`invoiceId` varchar(255),
	`customerId` varchar(255),
	`subscriptionId` varchar(255),
	`amountCents` int NOT NULL,
	`amountRefundedCents` int NOT NULL DEFAULT 0,
	`currency` varchar(8) NOT NULL DEFAULT 'usd',
	`status` enum('paid','refunded','partially_refunded','failed','pending') NOT NULL,
	`customerName` varchar(255),
	`customerEmail` varchar(320),
	`purpose` enum('order','affiliate_membership','other') NOT NULL DEFAULT 'other',
	`description` text,
	`lineItemsJson` json,
	`metadataJson` json,
	`orderRequestId` int,
	`orderNumber` varchar(64),
	`affiliateId` int,
	`affiliateInvoiceId` int,
	`receiptEmail` varchar(320),
	`receiptUrl` text,
	`receiptEmailSent` boolean NOT NULL DEFAULT false,
	`invoiceEmailSent` boolean NOT NULL DEFAULT false,
	`hostedInvoiceUrl` text,
	`invoicePdfUrl` text,
	`stripeDashboardUrl` varchar(512),
	`occurredAt` timestamp NOT NULL,
	`lastEventId` varchar(255),
	`lastEventType` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `stripe_payment_records_id` PRIMARY KEY(`id`),
	CONSTRAINT `stripe_payment_records_session_uq` UNIQUE(`checkoutSessionId`),
	CONSTRAINT `stripe_payment_records_pi_uq` UNIQUE(`paymentIntentId`),
	CONSTRAINT `stripe_payment_records_charge_uq` UNIQUE(`chargeId`),
	CONSTRAINT `stripe_payment_records_invoice_uq` UNIQUE(`invoiceId`)
);
--> statement-breakpoint
CREATE TABLE `stripe_webhook_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` varchar(255) NOT NULL,
	`eventType` varchar(128) NOT NULL,
	`processedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stripe_webhook_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `stripe_webhook_events_eventId_unique` UNIQUE(`eventId`)
);
--> statement-breakpoint
CREATE INDEX `stripe_payment_records_affiliate_occurred_idx` ON `stripe_payment_records` (`affiliateId`,`occurredAt`);--> statement-breakpoint
CREATE INDEX `stripe_payment_records_occurred_idx` ON `stripe_payment_records` (`occurredAt`);--> statement-breakpoint
CREATE INDEX `stripe_payment_records_status_idx` ON `stripe_payment_records` (`status`);