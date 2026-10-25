CREATE TABLE `media_images` (
	`id` int AUTO_INCREMENT NOT NULL,
	`folder` varchar(128) NOT NULL DEFAULT 'General',
	`label` varchar(256) NOT NULL,
	`url` varchar(512) NOT NULL,
	`fileKey` varchar(512),
	`mimeType` varchar(64),
	`sizeBytes` int,
	`uploadedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `media_images_id` PRIMARY KEY(`id`)
);
