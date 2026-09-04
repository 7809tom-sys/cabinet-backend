CREATE TABLE `design_image_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`kitchenDesignId` int NOT NULL,
	`designRevision` varchar(64) NOT NULL,
	`planFingerprint` varchar(64) NOT NULL,
	`sceneSignature` varchar(191) NOT NULL,
	`name` varchar(120) NOT NULL,
	`email` varchar(320) NOT NULL,
	`phoneE164` varchar(32) NOT NULL,
	`phoneHash` varchar(64) NOT NULL,
	`consentAt` timestamp NOT NULL,
	`verificationStatus` enum('pending','verified','expired','failed','provider_unavailable') NOT NULL DEFAULT 'pending',
	`verificationProvider` varchar(32) NOT NULL DEFAULT 'twilio_verify',
	`verificationSid` varchar(128),
	`verificationRequestedAt` timestamp,
	`verifiedAt` timestamp,
	`generationStatus` enum('blocked','ready','generating','completed','failed') NOT NULL DEFAULT 'blocked',
	`designPhotoRenderId` int,
	`imageUrl` varchar(512),
	`crmDeliveredAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `design_image_requests_id` PRIMARY KEY(`id`),
	CONSTRAINT `design_image_requests_scene_signature_uq` UNIQUE(`sceneSignature`)
);
--> statement-breakpoint
CREATE INDEX `design_image_requests_design_revision_idx` ON `design_image_requests` (`kitchenDesignId`,`designRevision`);--> statement-breakpoint
CREATE INDEX `design_image_requests_user_updated_idx` ON `design_image_requests` (`userId`,`updatedAt`);--> statement-breakpoint
CREATE INDEX `design_image_requests_phone_status_idx` ON `design_image_requests` (`phoneHash`,`verificationStatus`);