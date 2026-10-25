ALTER TABLE `users` ADD `authId` varchar(36);--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_authId_unique` UNIQUE(`authId`);