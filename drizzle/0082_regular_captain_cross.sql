ALTER TABLE `cabinets` ADD `corner_type` varchar(50);--> statement-breakpoint
ALTER TABLE `cabinets` ADD `shelf_radius` decimal(5,2);--> statement-breakpoint
ALTER TABLE `cabinets` ADD `shelf_count` int;--> statement-breakpoint
ALTER TABLE `cabinets` ADD `cabinet_square` decimal(5,2);--> statement-breakpoint
ALTER TABLE `cabinets` ADD `face_width` decimal(5,2);--> statement-breakpoint
ALTER TABLE `cabinets` ADD `leg_width` decimal(5,2);--> statement-breakpoint
ALTER TABLE `cabinets` ADD `configVerified` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `cabinets` ADD `configVerifiedAt` timestamp;--> statement-breakpoint
ALTER TABLE `cabinets` ADD `configVerifiedByName` varchar(128);--> statement-breakpoint
ALTER TABLE `cabinets` ADD `doorOrientation` varchar(16);