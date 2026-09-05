CREATE TABLE `design_gemini_image_test_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`kitchenDesignId` int NOT NULL,
	`designRevision` varchar(191) NOT NULL,
	`planFingerprint` varchar(64) NOT NULL,
	`sceneSignature` varchar(191) NOT NULL,
	`interactionId` varchar(255) NOT NULL,
	`status` enum('pending','completed','failed') NOT NULL DEFAULT 'pending',
	`errorMessage` varchar(255),
	`imageUrl` varchar(512),
	`provenance` json NOT NULL,
	`promptFingerprint` varchar(64) NOT NULL,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `design_gemini_image_test_jobs_id` PRIMARY KEY(`id`),
	CONSTRAINT `design_gemini_image_test_jobs_interaction_uq` UNIQUE(`interactionId`)
);
--> statement-breakpoint
CREATE INDEX `design_gemini_image_test_jobs_user_design_status_idx` ON `design_gemini_image_test_jobs` (`userId`,`kitchenDesignId`,`status`,`updatedAt`);