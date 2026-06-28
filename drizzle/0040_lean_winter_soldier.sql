CREATE TABLE `branding_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`siteName` varchar(128) NOT NULL DEFAULT 'Cabinet Dealz',
	`logoUrl` varchar(512) NOT NULL DEFAULT '',
	`faviconUrl` varchar(512) NOT NULL DEFAULT '',
	`primaryColor` varchar(16) NOT NULL DEFAULT '#1a2b4a',
	`accentColor` varchar(16) NOT NULL DEFAULT '#c9a227',
	`tagline` varchar(255) NOT NULL DEFAULT '',
	`supportEmail` varchar(255) NOT NULL DEFAULT '',
	`supportPhone` varchar(64) NOT NULL DEFAULT '',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `branding_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `email_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`smtpHost` varchar(255) NOT NULL DEFAULT '',
	`smtpPort` int NOT NULL DEFAULT 465,
	`smtpUser` varchar(255) NOT NULL DEFAULT '',
	`smtpPass` varchar(255) NOT NULL DEFAULT '',
	`smtpFrom` varchar(255) NOT NULL DEFAULT '',
	`enabled` boolean NOT NULL DEFAULT false,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `email_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notification_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`onNewOrder` varchar(1024) NOT NULL DEFAULT '',
	`onNewDesignLead` varchar(1024) NOT NULL DEFAULT '',
	`onNewQuoteRequest` varchar(1024) NOT NULL DEFAULT '',
	`onNewProApplication` varchar(1024) NOT NULL DEFAULT '',
	`onNewConsultation` varchar(1024) NOT NULL DEFAULT '',
	`onNewAffiliate` varchar(1024) NOT NULL DEFAULT '',
	`enabled` boolean NOT NULL DEFAULT true,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notification_settings_id` PRIMARY KEY(`id`)
);
