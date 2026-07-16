CREATE TABLE `media_library` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fileKey` varchar(512) NOT NULL,
	`url` varchar(1024) NOT NULL,
	`filename` varchar(256),
	`mimeType` varchar(64),
	`sizeBytes` int,
	`uploadedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `media_library_id` PRIMARY KEY(`id`),
	CONSTRAINT `media_library_fileKey_unique` UNIQUE(`fileKey`)
);
