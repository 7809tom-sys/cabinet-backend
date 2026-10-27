ALTER TABLE `affiliates` MODIFY COLUMN `w9TaxId` varchar(512);--> statement-breakpoint
ALTER TABLE `affiliates` ADD `w9TaxIdLast4` varchar(4);