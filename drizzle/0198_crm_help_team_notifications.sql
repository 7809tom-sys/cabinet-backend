ALTER TABLE `notification_settings` ADD `onCrmDesignHelp` varchar(1024) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `notification_settings` ADD `onCrmShippingHelp` varchar(1024) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `notification_settings` ADD `notifyOnCrmDesignHelp` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `notification_settings` ADD `notifyOnCrmShippingHelp` boolean DEFAULT false NOT NULL;