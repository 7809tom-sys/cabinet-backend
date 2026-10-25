ALTER TABLE `users` ADD `emailLower` varchar(320);--> statement-breakpoint
ALTER TABLE `users` ADD `passwordHash` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `failedLoginAttempts` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `lockedUntil` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_emailLower_unique` UNIQUE(`emailLower`);