CREATE TABLE `door_style_corrections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`styleId` int NOT NULL,
	`imageUrl` varchar(512) NOT NULL,
	`fileKey` varchar(512) NOT NULL,
	`previousImageUrl` varchar(512),
	`note` varchar(512),
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`submittedBy` int NOT NULL,
	`submittedByName` varchar(256),
	`reviewedBy` int,
	`reviewedAt` timestamp,
	`reviewNote` varchar(512),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `door_style_corrections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `door_styles` ADD `doorSampleVerified` boolean DEFAULT false NOT NULL;