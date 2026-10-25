ALTER TABLE `affiliate_style_branding` ADD `featured` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `affiliate_style_branding` ADD `sortOrder` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `affiliate_style_branding` ADD `roomSceneUrl` text;