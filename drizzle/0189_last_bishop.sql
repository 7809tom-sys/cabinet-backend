ALTER TABLE `cabinets` MODIFY COLUMN `width` decimal(7,3);--> statement-breakpoint
ALTER TABLE `cabinets` MODIFY COLUMN `height` decimal(7,3);--> statement-breakpoint
ALTER TABLE `cabinets` MODIFY COLUMN `depth` decimal(7,3);--> statement-breakpoint
ALTER TABLE `cabinets` MODIFY COLUMN `physicalWidth` decimal(7,3);--> statement-breakpoint
ALTER TABLE `distributor_cabinet_overrides` MODIFY COLUMN `width` decimal(7,3);--> statement-breakpoint
ALTER TABLE `distributor_cabinet_overrides` MODIFY COLUMN `height` decimal(7,3);--> statement-breakpoint
ALTER TABLE `distributor_cabinet_overrides` MODIFY COLUMN `depth` decimal(7,3);--> statement-breakpoint
ALTER TABLE `distributor_cabinet_overrides` MODIFY COLUMN `physicalWidth` decimal(7,3);--> statement-breakpoint
ALTER TABLE `distributor_skus` MODIFY COLUMN `geometryWidth` decimal(7,3);--> statement-breakpoint
ALTER TABLE `distributor_skus` MODIFY COLUMN `geometryHeight` decimal(7,3);--> statement-breakpoint
ALTER TABLE `distributor_skus` MODIFY COLUMN `geometryDepth` decimal(7,3);