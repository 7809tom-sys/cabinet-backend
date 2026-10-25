ALTER TABLE `affiliates` ADD `w9Status` enum('pending','submitted','verified') DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `affiliates` ADD `w9LegalName` varchar(256);--> statement-breakpoint
ALTER TABLE `affiliates` ADD `w9BusinessName` varchar(256);--> statement-breakpoint
ALTER TABLE `affiliates` ADD `w9EntityType` enum('individual','sole_proprietor','llc_single','llc_partnership','llc_corp','c_corp','s_corp','partnership','trust','other');--> statement-breakpoint
ALTER TABLE `affiliates` ADD `w9TaxId` varchar(64);--> statement-breakpoint
ALTER TABLE `affiliates` ADD `w9TaxIdType` enum('ssn','ein');--> statement-breakpoint
ALTER TABLE `affiliates` ADD `w9Address` varchar(256);--> statement-breakpoint
ALTER TABLE `affiliates` ADD `w9City` varchar(128);--> statement-breakpoint
ALTER TABLE `affiliates` ADD `w9State` varchar(2);--> statement-breakpoint
ALTER TABLE `affiliates` ADD `w9Zip` varchar(16);--> statement-breakpoint
ALTER TABLE `affiliates` ADD `w9IdDocumentUrl` varchar(512);--> statement-breakpoint
ALTER TABLE `affiliates` ADD `w9SubmittedAt` timestamp;--> statement-breakpoint
ALTER TABLE `affiliates` ADD `w9VerifiedAt` timestamp;--> statement-breakpoint
ALTER TABLE `affiliates` ADD `w9AdminNotes` text;