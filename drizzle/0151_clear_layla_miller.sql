ALTER TABLE `distributor_skus` ADD `onHandQty` int;--> statement-breakpoint
ALTER TABLE `distributors` ADD `inventoryForecastCloseRateBps` int;--> statement-breakpoint
ALTER TABLE `distributors` ADD `inventoryForecastLowRateBps` int;--> statement-breakpoint
ALTER TABLE `distributors` ADD `inventoryForecastHighRateBps` int;