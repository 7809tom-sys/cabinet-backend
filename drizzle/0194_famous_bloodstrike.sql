ALTER TABLE `freight_quote_history` ADD `kitchenDesignId` int;--> statement-breakpoint
CREATE INDEX `freight_quote_history_kitchen_design_idx` ON `freight_quote_history` (`kitchenDesignId`);