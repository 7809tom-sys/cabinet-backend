CREATE TABLE `cabinet_images` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cabinetCode` varchar(32) NOT NULL,
	`s3Key` varchar(512) NOT NULL,
	`s3Url` varchar(1024) NOT NULL,
	`uploadedBy` int,
	`uploadedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cabinet_images_id` PRIMARY KEY(`id`),
	CONSTRAINT `cabinet_images_cabinetCode_unique` UNIQUE(`cabinetCode`)
);
