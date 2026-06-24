ALTER TABLE `cabinets` ADD `conflictStatus` varchar(16) DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `cabinets` ADD `conflictReason` text;--> statement-breakpoint
ALTER TABLE `cabinets` ADD `conflictedAt` timestamp;