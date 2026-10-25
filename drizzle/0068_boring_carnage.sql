CREATE TABLE `import_pending_skus` (
	`id` int AUTO_INCREMENT NOT NULL,
	`distributorId` int NOT NULL,
	`rawCode` varchar(128) NOT NULL,
	`pricesJson` text NOT NULL,
	`status` enum('pending','resolved','ignored') NOT NULL DEFAULT 'pending',
	`resolvedCabinetId` int,
	`resolvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `import_pending_skus_id` PRIMARY KEY(`id`),
	CONSTRAINT `uniq_dist_code` UNIQUE(`distributorId`,`rawCode`)
);
