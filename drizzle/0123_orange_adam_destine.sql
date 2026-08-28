CREATE TABLE `admin_sticky_notes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(120),
	`body` text NOT NULL,
	`color` varchar(16) NOT NULL DEFAULT 'yellow',
	`isPinned` boolean NOT NULL DEFAULT false,
	`authorId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `admin_sticky_notes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `admin_sticky_notes_pin_updated_idx` ON `admin_sticky_notes` (`isPinned`,`updatedAt`);--> statement-breakpoint
CREATE INDEX `admin_sticky_notes_author_idx` ON `admin_sticky_notes` (`authorId`);