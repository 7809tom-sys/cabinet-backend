-- Migration 0223. Journal idx 222, when 1794400000000.
-- Door rendering audit runs, per-style run results, append-only render
-- versions, and accept/reject/revert history.
-- TiDB SQL editor statements are in
-- docs/sql/0223_door_rendering_audit.tidb.sql.
CREATE TABLE `door_rendering_audit_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`scope` enum('all','changed','selected') NOT NULL,
	`status` enum('awaiting_renders','scoring','completed','failed','cancelled') NOT NULL DEFAULT 'awaiting_renders',
	`requestedBy` int NOT NULL,
	`requestedByName` varchar(255),
	`renderingCommit` varchar(128),
	`styleCap` int NOT NULL DEFAULT 40,
	`selectedCount` int NOT NULL DEFAULT 0,
	`pendingCount` int NOT NULL DEFAULT 0,
	`scoredCount` int NOT NULL DEFAULT 0,
	`failedCount` int NOT NULL DEFAULT 0,
	`flaggedCount` int NOT NULL DEFAULT 0,
	`skippedUnchangedCount` int NOT NULL DEFAULT 0,
	`skippedMissingSampleCount` int NOT NULL DEFAULT 0,
	`errorMessage` varchar(512),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`completedAt` timestamp,
	CONSTRAINT `door_rendering_audit_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `door_rendering_audit_runs_created_idx` ON `door_rendering_audit_runs` (`createdAt`);
--> statement-breakpoint
CREATE INDEX `door_rendering_audit_runs_status_idx` ON `door_rendering_audit_runs` (`status`,`createdAt`);
--> statement-breakpoint
CREATE TABLE `door_rendering_audit_results` (
	`id` int AUTO_INCREMENT NOT NULL,
	`runId` int NOT NULL,
	`styleId` int NOT NULL,
	`status` enum('pending_render','scoring','scored','failed') NOT NULL DEFAULT 'pending_render',
	`renderingCommit` varchar(128),
	`samplePhotoUrl` varchar(512) NOT NULL,
	`renderImageUrl` varchar(512),
	`versionId` int,
	`woodGrainScore` int,
	`colorScore` int,
	`textureSheenScore` int,
	`profileEdgesScore` int,
	`overallScore` int,
	`acceptedOverallScore` int,
	`scoreDelta` int,
	`verdict` enum('pending','flagged','not_flagged','no_baseline','failed') NOT NULL DEFAULT 'pending',
	`notes` varchar(512),
	`errorMessage` varchar(512),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`scoredAt` timestamp,
	CONSTRAINT `door_rendering_audit_results_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `door_rendering_audit_results_run_style_uq` ON `door_rendering_audit_results` (`runId`,`styleId`);
--> statement-breakpoint
CREATE INDEX `door_rendering_audit_results_style_idx` ON `door_rendering_audit_results` (`styleId`,`createdAt`);
--> statement-breakpoint
CREATE TABLE `door_rendering_versions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`styleId` int NOT NULL,
	`runId` int,
	`renderingCommit` varchar(128),
	`samplePhotoUrl` varchar(512) NOT NULL,
	`renderImageUrl` varchar(512) NOT NULL,
	`renderImageKey` varchar(512),
	`woodGrainScore` int NOT NULL,
	`colorScore` int NOT NULL,
	`textureSheenScore` int NOT NULL,
	`profileEdgesScore` int NOT NULL,
	`overallScore` int NOT NULL,
	`acceptedOverallScore` int,
	`scoreDelta` int,
	`verdict` enum('flagged','not_flagged','no_baseline') NOT NULL,
	`notes` varchar(512),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `door_rendering_versions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `door_rendering_versions_style_created_idx` ON `door_rendering_versions` (`styleId`,`createdAt`);
--> statement-breakpoint
CREATE INDEX `door_rendering_versions_run_idx` ON `door_rendering_versions` (`runId`);
--> statement-breakpoint
CREATE TABLE `door_rendering_version_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`styleId` int NOT NULL,
	`versionId` int NOT NULL,
	`action` enum('accepted','rejected','reverted') NOT NULL,
	`actorUserId` int NOT NULL,
	`note` varchar(512),
	`previousAcceptedVersionId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `door_rendering_version_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `door_rendering_version_events_style_idx` ON `door_rendering_version_events` (`styleId`,`createdAt`);
--> statement-breakpoint
CREATE INDEX `door_rendering_version_events_version_idx` ON `door_rendering_version_events` (`versionId`,`createdAt`);
