CREATE TABLE `affiliate_featured_distributor_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`affiliateId` int NOT NULL,
	`distributorId` int NOT NULL,
	`eventType` enum('view') NOT NULL,
	`sessionKey` varchar(96) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `affiliate_featured_distributor_events_id` PRIMARY KEY(`id`)
);
ALTER TABLE `design_leads` ADD `featuredDistributorId` int;--> statement-breakpoint
CREATE INDEX `affiliate_featured_dist_event_idx` ON `affiliate_featured_distributor_events` (`affiliateId`,`distributorId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `affiliate_featured_session_idx` ON `affiliate_featured_distributor_events` (`affiliateId`,`distributorId`,`sessionKey`,`createdAt`);
