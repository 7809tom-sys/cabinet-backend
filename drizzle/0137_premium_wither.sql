ALTER TABLE `order_requests` ADD `kitchenDesignId` int;--> statement-breakpoint
ALTER TABLE `order_requests` ADD CONSTRAINT `order_requests_kitchen_design_fk` FOREIGN KEY (`kitchenDesignId`) REFERENCES `kitchen_designs`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX `order_requests_kitchen_design_idx` ON `order_requests` (`kitchenDesignId`);