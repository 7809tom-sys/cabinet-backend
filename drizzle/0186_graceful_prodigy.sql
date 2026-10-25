ALTER TABLE `affiliates` ADD `watermarkEnabled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `affiliates` ADD `watermarkPosition` enum('bottom-right') DEFAULT 'bottom-right' NOT NULL;--> statement-breakpoint
ALTER TABLE `affiliates` ADD `watermarkOpacityBps` int DEFAULT 7200 NOT NULL;