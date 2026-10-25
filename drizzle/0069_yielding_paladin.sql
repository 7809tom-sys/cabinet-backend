CREATE TABLE `measure_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`token` varchar(64) NOT NULL,
	`userId` int,
	`measurements` text,
	`status` enum('pending','completed','consumed') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	`expiresAt` timestamp NOT NULL,
	CONSTRAINT `measure_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `measure_sessions_token_unique` UNIQUE(`token`)
);
