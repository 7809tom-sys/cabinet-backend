ALTER TABLE `design_gemini_image_test_jobs` ADD `retryCount` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `design_gemini_image_test_jobs` ADD `nextRetryAt` timestamp;