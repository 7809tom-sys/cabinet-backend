-- Migration 0213. Journal idx 212 assumes reserved migrations 0206–0212
-- occupy idx 205–211. Rebase this journal entry after those migrations merge.
ALTER TABLE `vendor_lines` ADD `shippingServiceCodes` json;
--> statement-breakpoint
ALTER TABLE `vendor_lines` ADD `shippingFreightClass` varchar(8);
--> statement-breakpoint
ALTER TABLE `vendor_lines` ADD `shipFromZip` varchar(16);
--> statement-breakpoint
ALTER TABLE `vendor_lines` ADD `shippingQuoteProvider` enum('none','http','pelican','carrier_ltl') NOT NULL DEFAULT 'none';
--> statement-breakpoint
ALTER TABLE `vendor_lines` ADD `shippingQuoteUrl` varchar(512);
--> statement-breakpoint
ALTER TABLE `vendor_lines` ADD `shippingQuoteAuthHeaderName` varchar(128);
--> statement-breakpoint
ALTER TABLE `vendor_lines` ADD `shippingQuoteSecretEncrypted` varchar(2048);
--> statement-breakpoint
ALTER TABLE `vendor_lines` ADD `shippingQuoteAdminEnabled` boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE `vendor_lines` ADD `shippingQuoteVendorEnabled` boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE `distributor_integrations` ADD `adminEnabled` boolean NOT NULL DEFAULT false;
