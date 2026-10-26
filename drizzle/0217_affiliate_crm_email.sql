-- Migration 0217. Reserved after 0216.
-- Rebase this journal entry onto main after migrations 0206–0216 land so
-- 0217 is applied after 0216. Additive only: no changes to crm_deals.
CREATE TABLE `affiliate_email_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`affiliateId` int NOT NULL,
	`provider` varchar(32) NOT NULL DEFAULT 'custom',
	`smtpHost` varchar(255) NOT NULL DEFAULT '',
	`smtpPort` int NOT NULL DEFAULT 587,
	`smtpUser` varchar(255) NOT NULL DEFAULT '',
	`smtpPass` text NOT NULL,
	`smtpFrom` varchar(320) NOT NULL DEFAULT '',
	`fromName` varchar(256) NOT NULL DEFAULT '',
	`replyTo` varchar(320) NOT NULL DEFAULT '',
	`signatureHtml` text NOT NULL,
	`enabled` boolean NOT NULL DEFAULT false,
	`lastTestedAt` timestamp,
	`lastTestOk` boolean,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `affiliate_email_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `affiliate_email_settings_affiliate_uidx` ON `affiliate_email_settings` (`affiliateId`);
--> statement-breakpoint
CREATE TABLE `crm_email_drafts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`affiliateId` int,
	`dealId` int,
	`authorUserId` int,
	`toEmail` varchar(320) NOT NULL DEFAULT '',
	`subject` varchar(512) NOT NULL DEFAULT '',
	`bodyHtml` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `crm_email_drafts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `crm_email_drafts_scope_idx` ON `crm_email_drafts` (`affiliateId`,`updatedAt`);
--> statement-breakpoint
CREATE INDEX `crm_email_drafts_deal_idx` ON `crm_email_drafts` (`dealId`);
--> statement-breakpoint
CREATE TABLE `crm_email_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`affiliateId` int,
	`name` varchar(128) NOT NULL,
	`subject` varchar(512) NOT NULL DEFAULT '',
	`bodyHtml` text NOT NULL,
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `crm_email_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `crm_email_templates_scope_idx` ON `crm_email_templates` (`affiliateId`,`updatedAt`);
--> statement-breakpoint
CREATE TABLE `crm_deal_files` (
	`id` int AUTO_INCREMENT NOT NULL,
	`dealId` int NOT NULL,
	`fileName` varchar(256) NOT NULL,
	`fileUrl` varchar(1024) NOT NULL,
	`uploadedByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `crm_deal_files_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `crm_deal_files_deal_idx` ON `crm_deal_files` (`dealId`);
