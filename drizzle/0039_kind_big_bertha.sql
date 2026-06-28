CREATE TABLE `site_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pricingVisibility` enum('public','logged_in','dealer','admin','hidden') NOT NULL DEFAULT 'public',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `site_settings_id` PRIMARY KEY(`id`)
);
