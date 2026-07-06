ALTER TABLE `vendor_lines` ADD `inviteToken` varchar(64);--> statement-breakpoint
ALTER TABLE `vendor_lines` ADD `inviteCreatedAt` timestamp;--> statement-breakpoint
ALTER TABLE `vendor_lines` ADD CONSTRAINT `vendor_lines_inviteToken_unique` UNIQUE(`inviteToken`);