CREATE TABLE `cabinet_3d_previews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cabinetId` int NOT NULL,
	`styleId` int NOT NULL,
	`imageUrl` varchar(512) NOT NULL,
	`prompt` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cabinet_3d_previews_id` PRIMARY KEY(`id`)
);
