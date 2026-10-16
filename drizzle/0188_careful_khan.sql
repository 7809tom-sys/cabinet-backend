ALTER TABLE `distributor_skus` ADD `constructionType` varchar(32);--> statement-breakpoint
ALTER TABLE `distributor_skus` ADD `geometryWidth` decimal(6,2);--> statement-breakpoint
ALTER TABLE `distributor_skus` ADD `geometryHeight` decimal(6,2);--> statement-breakpoint
ALTER TABLE `distributor_skus` ADD `geometryDepth` decimal(6,2);--> statement-breakpoint
ALTER TABLE `distributor_skus` ADD `geometryToeKickHeight` decimal(5,2);--> statement-breakpoint
ALTER TABLE `distributor_skus` ADD `geometrySourcePage` varchar(128);--> statement-breakpoint
ALTER TABLE `distributor_skus` ADD `geometryStatus` varchar(16);