ALTER TABLE `distributor_skus` ADD `status` enum('approved','pending','rejected') DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE `distributors` ADD `designToolPicks` json;