-- Migration 0218. On this branch the journal entry is appended after 0205.
-- Rebase after earlier migrations through 0217 merge so this entry follows 0217.
-- No Cura printed-material catalog exists in this repo. Printed materials use
-- affiliate_resources rows of type pdf; an admin uploads the files later.
-- Example rows below are unpublished drafts. They are structure only.
ALTER TABLE `affiliates` ADD `socialLinks` json;--> statement-breakpoint
ALTER TABLE `affiliate_team_members` ADD `accessMarketing` boolean NOT NULL DEFAULT false;--> statement-breakpoint
CREATE TABLE `affiliate_resources` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('script','guide','video','pdf','social','link') NOT NULL,
	`title` varchar(255) NOT NULL,
	`body` text,
	`url` varchar(1024),
	`fileKey` varchar(512),
	`filename` varchar(255),
	`mimeType` varchar(128),
	`sizeBytes` int,
	`thumbnailKey` varchar(512),
	`category` varchar(64) NOT NULL DEFAULT 'general',
	`metaJson` json,
	`sortOrder` int NOT NULL DEFAULT 0,
	`isPublished` boolean NOT NULL DEFAULT false,
	`featured` boolean NOT NULL DEFAULT false,
	`uploadedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `affiliate_resources_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE TABLE `affiliate_resource_progress` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`resourceId` int NOT NULL,
	`completed` boolean NOT NULL DEFAULT false,
	`progressPercent` int NOT NULL DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `affiliate_resource_progress_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE INDEX `affiliate_resources_type_sort_idx` ON `affiliate_resources` (`type`,`sortOrder`);--> statement-breakpoint
CREATE INDEX `affiliate_resources_published_idx` ON `affiliate_resources` (`isPublished`,`sortOrder`);--> statement-breakpoint
CREATE UNIQUE INDEX `affiliate_resource_progress_user_resource_uq` ON `affiliate_resource_progress` (`userId`,`resourceId`);--> statement-breakpoint
INSERT INTO `affiliate_resources` (`type`, `title`, `body`, `url`, `category`, `metaJson`, `sortOrder`, `isPublished`, `featured`) VALUES
('link', 'EXAMPLE DRAFT: Finish your store profile', 'DRAFT example only. Replace this before publishing. This is not a company policy, price, or link.', NULL, 'start-here', NULL, 0, false, false),
('link', 'EXAMPLE DRAFT: Share your storefront', 'DRAFT example only. Replace this before publishing. This is not a company policy, price, or link.', NULL, 'start-here', NULL, 1, false, false),
('script', 'EXAMPLE DRAFT: Phone introduction', 'DRAFT example only. Replace this before publishing. This is not a company policy, price, or link.', NULL, 'phone', NULL, 2, false, false),
('script', 'EXAMPLE DRAFT: In-store conversation', 'DRAFT example only. Replace this before publishing. This is not a company policy, price, or link.', NULL, 'in-store', NULL, 3, false, false),
('script', 'EXAMPLE DRAFT: Follow-up', 'DRAFT example only. Replace this before publishing. This is not a company policy, price, or link.', NULL, 'follow-up', NULL, 4, false, false),
('script', 'EXAMPLE DRAFT: Objection handling', 'DRAFT example only. Replace this before publishing. This is not a company policy, price, or link.', NULL, 'objection', NULL, 5, false, false),
('script', 'EXAMPLE DRAFT: Closing', 'DRAFT example only. Replace this before publishing. This is not a company policy, price, or link.', NULL, 'closing', NULL, 6, false, false),
('guide', 'EXAMPLE DRAFT: Designer basics', 'DRAFT example only. Replace this before publishing. This is not a company policy, price, or link.\n\n1. Replace this step.\n2. Replace this step.', NULL, 'designer', NULL, 7, false, false),
('guide', 'EXAMPLE DRAFT: Quoting', 'DRAFT example only. Replace this before publishing. This is not a company policy, price, or link.', NULL, 'quoting', NULL, 8, false, false),
('guide', 'EXAMPLE DRAFT: Measuring', 'DRAFT example only. Replace this before publishing. This is not a company policy, price, or link.', NULL, 'measuring', NULL, 9, false, false),
('guide', 'EXAMPLE DRAFT: Ordering', 'DRAFT example only. Replace this before publishing. This is not a company policy, price, or link.', NULL, 'ordering', NULL, 10, false, false),
('guide', 'EXAMPLE DRAFT: Pricing and margins', 'DRAFT example only. Replace this before publishing. This is not a company policy, price, or link.', NULL, 'pricing', NULL, 11, false, false),
('guide', 'EXAMPLE DRAFT: Using the CRM', 'DRAFT example only. Replace this before publishing. This is not a company policy, price, or link.', NULL, 'crm', NULL, 12, false, false),
('video', 'EXAMPLE DRAFT: 20-minute 3D Designer walkthrough', 'DRAFT example only. An admin replaces the YouTube link before publishing. This is not a real video.', NULL, 'training', '{"placeholder":true,"durationSeconds":1200,"chapters":[{"label":"Example chapter A","startSeconds":0},{"label":"Example chapter B","startSeconds":600}]}', 13, false, true),
('pdf', 'EXAMPLE DRAFT: Brochure', 'DRAFT example only. Upload the PDF before publishing. No Cura file was found in the repo.', NULL, 'brochure', NULL, 14, false, false),
('pdf', 'EXAMPLE DRAFT: Spec sheet', 'DRAFT example only. Upload the PDF before publishing.', NULL, 'spec-sheet', NULL, 15, false, false),
('pdf', 'EXAMPLE DRAFT: Door style card', 'DRAFT example only. Upload the PDF before publishing.', NULL, 'door-style', NULL, 16, false, false),
('social', 'EXAMPLE DRAFT: Social caption', 'DRAFT example only. Replace this caption before publishing. This is not a company post.', NULL, 'caption', '{"hashtags":["#example","#replace-me"]}', 17, false, false),
('social', 'EXAMPLE DRAFT: Posting calendar idea', 'DRAFT example only. Replace this calendar note before publishing.', NULL, 'calendar', NULL, 18, false, false),
('social', 'EXAMPLE DRAFT: Platform tip', 'DRAFT example only. Replace this tip before publishing.', NULL, 'platform-tip', NULL, 19, false, false),
('link', 'EXAMPLE DRAFT: Sales tip', 'DRAFT example only. Replace this before publishing. This is not a company policy, price, or link.', NULL, 'tip', NULL, 20, false, false),
('link', 'EXAMPLE DRAFT: FAQ', 'DRAFT example only. Replace this before publishing. This is not a company policy, price, or link.', NULL, 'faq', NULL, 21, false, false),
('link', 'EXAMPLE DRAFT: What is new', 'DRAFT example only. Replace this before publishing. This is not a company announcement.', NULL, 'whats-new', NULL, 22, false, false);