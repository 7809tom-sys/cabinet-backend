CREATE TABLE `door_style_measurement_submissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`styleId` int NOT NULL,
	`distributorId` int NOT NULL,
	`vendorLineName` varchar(255) NOT NULL,
	`vendorStyleCode` varchar(64) NOT NULL,
	`vendorStyleName` varchar(255) NOT NULL,
	`appliesToStyleIds` json NOT NULL,
	`measuredBy` varchar(255) NOT NULL,
	`measuredOn` varchar(10) NOT NULL,
	`measurementData` json NOT NULL,
	`citation` varchar(512) NOT NULL,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`submittedBy` int NOT NULL,
	`submittedByName` varchar(255),
	`submittedAt` timestamp NOT NULL DEFAULT (now()),
	`reviewedBy` int,
	`reviewedByName` varchar(255),
	`reviewedAt` timestamp,
	`reviewNote` varchar(512),
	CONSTRAINT `door_style_measurement_submissions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `door_style_measurements_style_status_idx` ON `door_style_measurement_submissions` (`styleId`,`status`);--> statement-breakpoint
CREATE INDEX `door_style_measurements_distributor_status_idx` ON `door_style_measurement_submissions` (`distributorId`,`status`);