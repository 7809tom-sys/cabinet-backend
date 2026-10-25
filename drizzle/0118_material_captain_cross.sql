CREATE TABLE `three_d_room_shares` (
	`id` int AUTO_INCREMENT NOT NULL,
	`token` varchar(48) NOT NULL,
	`kitchenDesignId` int,
	`configuration` json NOT NULL,
	`orderSubtotal` decimal(10,2),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `three_d_room_shares_id` PRIMARY KEY(`id`),
	CONSTRAINT `three_d_room_shares_token_uq` UNIQUE(`token`)
);
--> statement-breakpoint
ALTER TABLE `three_d_room_shares` ADD CONSTRAINT `3drs_design_fk` FOREIGN KEY (`kitchenDesignId`) REFERENCES `kitchen_designs`(`id`) ON DELETE set null ON UPDATE cascade;