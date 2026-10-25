CREATE TABLE `design_layout_instances` (
	`id` int AUTO_INCREMENT NOT NULL,
	`kitchenDesignId` int NOT NULL,
	`roomShapePresetId` varchar(64),
	`roomShapeVersion` int,
	`layoutPresetId` varchar(64),
	`layoutPresetVersion` int,
	`source` enum('wizard','manual','image_import','consultant','bundle') NOT NULL DEFAULT 'manual',
	`resolutionStatus` enum('draft','partially_resolved','resolved','needs_review') NOT NULL DEFAULT 'draft',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `design_layout_instances_id` PRIMARY KEY(`id`),
	CONSTRAINT `design_layout_instances_design_uq` UNIQUE(`kitchenDesignId`)
);
--> statement-breakpoint
CREATE TABLE `design_layout_zone_selections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`designLayoutInstanceId` int NOT NULL,
	`layoutPresetZoneId` int,
	`zoneKey` varchar(64) NOT NULL,
	`cabinetId` int,
	`distributorSkuId` int,
	`distributorId` int,
	`styleId` int,
	`placedCabinetUid` varchar(128),
	`status` enum('matched','customer_selected','needs_selection','unavailable','replaced','removed') NOT NULL DEFAULT 'needs_selection',
	`matchReason` varchar(128),
	`matchDetails` json,
	`resolvedAt` timestamp,
	`resolvedByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `design_layout_zone_selections_id` PRIMARY KEY(`id`),
	CONSTRAINT `dlzs_instance_zone_uq` UNIQUE(`designLayoutInstanceId`,`zoneKey`)
);
--> statement-breakpoint
CREATE TABLE `layout_preset_zones` (
	`id` int AUTO_INCREMENT NOT NULL,
	`layoutPresetId` varchar(64) NOT NULL,
	`zoneKey` varchar(64) NOT NULL,
	`label` varchar(128) NOT NULL,
	`wallKey` varchar(64),
	`sequence` int NOT NULL DEFAULT 0,
	`placementType` varchar(32) NOT NULL,
	`requiredCategory` varchar(64),
	`requiredSubCategory` varchar(128),
	`requiredProductType` varchar(32),
	`requiredCornerType` varchar(50),
	`minWidth` decimal(6,2),
	`targetWidth` decimal(6,2),
	`maxWidth` decimal(6,2),
	`minHeight` decimal(6,2),
	`maxHeight` decimal(6,2),
	`minDepth` decimal(6,2),
	`maxDepth` decimal(6,2),
	`isRequired` boolean NOT NULL DEFAULT true,
	`allowCustomSize` boolean NOT NULL DEFAULT false,
	`preferredMasterCode` varchar(64),
	`matchingRules` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `layout_preset_zones_id` PRIMARY KEY(`id`),
	CONSTRAINT `layout_preset_zones_layout_key_uq` UNIQUE(`layoutPresetId`,`zoneKey`)
);
--> statement-breakpoint
CREATE TABLE `layout_presets` (
	`id` varchar(64) NOT NULL,
	`roomShapePresetId` varchar(64) NOT NULL,
	`roomType` varchar(32) NOT NULL,
	`name` varchar(128) NOT NULL,
	`description` text,
	`thumbnailUrl` varchar(512),
	`minimumWidth` decimal(6,2),
	`minimumDepth` decimal(6,2),
	`defaultRoomData` json,
	`sortOrder` int NOT NULL DEFAULT 0,
	`isActive` boolean NOT NULL DEFAULT true,
	`version` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `layout_presets_id` PRIMARY KEY(`id`),
	CONSTRAINT `layout_presets_room_shape_name_uq` UNIQUE(`roomShapePresetId`,`name`)
);
--> statement-breakpoint
CREATE TABLE `room_shape_presets` (
	`id` varchar(64) NOT NULL,
	`roomType` varchar(32) NOT NULL,
	`name` varchar(128) NOT NULL,
	`description` text,
	`geometryTemplate` json NOT NULL,
	`defaultDimensions` json,
	`sortOrder` int NOT NULL DEFAULT 0,
	`isActive` boolean NOT NULL DEFAULT true,
	`version` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `room_shape_presets_id` PRIMARY KEY(`id`),
	CONSTRAINT `room_shape_presets_room_type_name_uq` UNIQUE(`roomType`,`name`)
);
--> statement-breakpoint
ALTER TABLE `kitchen_designs` ADD `designSchemaVersion` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `kitchen_designs` ADD `layoutSource` varchar(32);--> statement-breakpoint
ALTER TABLE `kitchen_designs` ADD `layoutPresetId` varchar(64);--> statement-breakpoint
ALTER TABLE `kitchen_designs` ADD `layoutPresetVersion` int;--> statement-breakpoint
ALTER TABLE `design_layout_instances` ADD CONSTRAINT `design_layout_instances_kitchenDesignId_kitchen_designs_id_fk` FOREIGN KEY (`kitchenDesignId`) REFERENCES `kitchen_designs`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `design_layout_instances` ADD CONSTRAINT `dli_shape_fk` FOREIGN KEY (`roomShapePresetId`) REFERENCES `room_shape_presets`(`id`) ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `design_layout_instances` ADD CONSTRAINT `dli_layout_fk` FOREIGN KEY (`layoutPresetId`) REFERENCES `layout_presets`(`id`) ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `design_layout_zone_selections` ADD CONSTRAINT `dlzs_instance_fk` FOREIGN KEY (`designLayoutInstanceId`) REFERENCES `design_layout_instances`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `design_layout_zone_selections` ADD CONSTRAINT `dlzs_zone_fk` FOREIGN KEY (`layoutPresetZoneId`) REFERENCES `layout_preset_zones`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `design_layout_zone_selections` ADD CONSTRAINT `dlzs_cab_fk` FOREIGN KEY (`cabinetId`) REFERENCES `cabinets`(`id`) ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `design_layout_zone_selections` ADD CONSTRAINT `dlzs_sku_fk` FOREIGN KEY (`distributorSkuId`) REFERENCES `distributor_skus`(`id`) ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `design_layout_zone_selections` ADD CONSTRAINT `dlzs_dist_fk` FOREIGN KEY (`distributorId`) REFERENCES `distributors`(`id`) ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `design_layout_zone_selections` ADD CONSTRAINT `dlzs_style_fk` FOREIGN KEY (`styleId`) REFERENCES `door_styles`(`id`) ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `design_layout_zone_selections` ADD CONSTRAINT `dlzs_user_fk` FOREIGN KEY (`resolvedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `layout_preset_zones` ADD CONSTRAINT `lpz_layout_fk` FOREIGN KEY (`layoutPresetId`) REFERENCES `layout_presets`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `layout_presets` ADD CONSTRAINT `lp_shape_fk` FOREIGN KEY (`roomShapePresetId`) REFERENCES `room_shape_presets`(`id`) ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX `dlzs_distributor_sku_ix` ON `design_layout_zone_selections` (`distributorSkuId`);--> statement-breakpoint
CREATE INDEX `dlzs_status_ix` ON `design_layout_zone_selections` (`status`);--> statement-breakpoint
CREATE INDEX `layout_preset_zones_sequence_ix` ON `layout_preset_zones` (`layoutPresetId`,`sequence`);--> statement-breakpoint
ALTER TABLE `kitchen_designs` ADD CONSTRAINT `kd_layout_fk` FOREIGN KEY (`layoutPresetId`) REFERENCES `layout_presets`(`id`) ON DELETE set null ON UPDATE cascade;
