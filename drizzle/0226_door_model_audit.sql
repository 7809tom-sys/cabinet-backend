-- Migration 0226. Journal idx 225, when 1794700000000.
-- Automatic 3D door audit: one job per door style, attempt history, and
-- status events. TiDB SQL editor statements are in
-- docs/sql/0226_door_model_audit.tidb.sql.
CREATE TABLE `door_model_audits` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `styleId` INT NOT NULL,
  `status` ENUM('queued','generating','checking','flagged','awaiting_tom','approved','rejected') NOT NULL DEFAULT 'queued',
  `sourceFingerprint` VARCHAR(512) NOT NULL,
  `doorSampleUrl` VARCHAR(512) NOT NULL,
  `drawerSampleUrl` VARCHAR(512) NULL,
  `attemptCount` INT NOT NULL DEFAULT 0,
  `maxAttempts` INT NOT NULL DEFAULT 3,
  `claimToken` VARCHAR(64) NULL,
  `currentAttemptId` INT NULL,
  `approvedAttemptId` INT NULL,
  `approvedModelSpec` TEXT NULL,
  `tomFeedback` VARCHAR(512) NULL,
  `flaggedReasons` TEXT NULL,
  `errorMessage` VARCHAR(512) NULL,
  `queuedAt` TIMESTAMP NULL DEFAULT NULL,
  `generatingAt` TIMESTAMP NULL DEFAULT NULL,
  `checkingAt` TIMESTAMP NULL DEFAULT NULL,
  `flaggedAt` TIMESTAMP NULL DEFAULT NULL,
  `awaitingTomAt` TIMESTAMP NULL DEFAULT NULL,
  `decidedAt` TIMESTAMP NULL DEFAULT NULL,
  `decidedBy` INT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);
--> statement-breakpoint
CREATE TABLE `door_model_audit_attempts` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `auditId` INT NOT NULL,
  `styleId` INT NOT NULL,
  `attemptNo` INT NOT NULL,
  `trigger` ENUM('auto','auto_revision','tom_rejection') NOT NULL DEFAULT 'auto',
  `modelSpec` TEXT NULL,
  `straightPreviewUrl` VARCHAR(512) NULL,
  `threeQuarterPreviewUrl` VARCHAR(512) NULL,
  `runPreviewUrl` VARCHAR(512) NULL,
  `colorScore` INT NULL,
  `grainScore` INT NULL,
  `profileScore` INT NULL,
  `proportionsScore` INT NULL,
  `drawerFrontScore` INT NULL,
  `checkNotes` TEXT NULL,
  `passed` BOOLEAN NULL,
  `reasons` TEXT NULL,
  `feedbackUsed` VARCHAR(1024) NULL,
  `checkerModel` VARCHAR(128) NULL,
  `errorMessage` VARCHAR(512) NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);
--> statement-breakpoint
CREATE TABLE `door_model_audit_events` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `auditId` INT NOT NULL,
  `styleId` INT NOT NULL,
  `fromStatus` VARCHAR(32) NULL,
  `toStatus` VARCHAR(32) NOT NULL,
  `attemptNo` INT NULL,
  `actorUserId` INT NULL,
  `note` VARCHAR(1024) NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `door_model_audits_style_uidx` ON `door_model_audits` (`styleId`);
--> statement-breakpoint
CREATE INDEX `door_model_audits_status_idx` ON `door_model_audits` (`status`, `updatedAt`);
--> statement-breakpoint
CREATE INDEX `door_model_audit_attempts_audit_idx` ON `door_model_audit_attempts` (`auditId`, `attemptNo`);
--> statement-breakpoint
CREATE INDEX `door_model_audit_attempts_style_idx` ON `door_model_audit_attempts` (`styleId`, `createdAt`);
--> statement-breakpoint
CREATE INDEX `door_model_audit_events_audit_idx` ON `door_model_audit_events` (`auditId`, `createdAt`);
