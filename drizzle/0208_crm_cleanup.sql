CREATE TABLE `crm_cleanup_previews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`actorUserId` int NOT NULL,
	`planHash` varchar(64) NOT NULL,
	`keepUserIdsJson` json NOT NULL,
	`alsoDeleteUserIdsJson` json NOT NULL,
	`deleteSupabaseAuth` boolean NOT NULL DEFAULT false,
	`snapshotJson` json NOT NULL,
	`countsJson` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp NOT NULL,
	CONSTRAINT `crm_cleanup_previews_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `crm_cleanup_audit` (
	`id` int AUTO_INCREMENT NOT NULL,
	`previewId` int NOT NULL,
	`actorUserId` int NOT NULL,
	`actorName` varchar(256),
	`actorEmail` varchar(320),
	`status` enum('running','completed','failed') NOT NULL,
	`keepUserIdsJson` json NOT NULL,
	`countsJson` json,
	`supabaseOptIn` boolean NOT NULL DEFAULT false,
	`supabaseDeleted` int NOT NULL DEFAULT 0,
	`supabaseFailed` int NOT NULL DEFAULT 0,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`finishedAt` timestamp,
	CONSTRAINT `crm_cleanup_audit_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `crm_cleanup_backup_rows` (
	`id` int AUTO_INCREMENT NOT NULL,
	`auditId` int NOT NULL,
	`tableName` varchar(64) NOT NULL,
	`rowPk` int NOT NULL,
	`rowJson` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `crm_cleanup_backup_rows_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `crm_cleanup_audit_created_idx` ON `crm_cleanup_audit` (`createdAt`);
--> statement-breakpoint
CREATE INDEX `crm_cleanup_backup_rows_audit_idx` ON `crm_cleanup_backup_rows` (`auditId`);
