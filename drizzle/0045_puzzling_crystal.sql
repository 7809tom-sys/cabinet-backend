CREATE TABLE `crm_email_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`dealId` int NOT NULL,
	`toEmail` varchar(320) NOT NULL,
	`fromEmail` varchar(320) NOT NULL,
	`subject` varchar(512) NOT NULL,
	`body` text NOT NULL,
	`sentByUserId` int,
	`sentByName` varchar(256),
	`sentAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `crm_email_log_id` PRIMARY KEY(`id`)
);
