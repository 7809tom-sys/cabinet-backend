ALTER TABLE `cabinets` RENAME COLUMN `updatedAt` TO `configuredAt`;--> statement-breakpoint
ALTER TABLE `cabinets` MODIFY COLUMN `configuredAt` timestamp;