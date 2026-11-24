-- Idempotent. Mirrors docs/sql/0285_backup_runs.tidb.sql (the file to paste into the TiDB editor).
CREATE TABLE IF NOT EXISTS `cabinet_dealz`.`backup_runs` (
  `id` int AUTO_INCREMENT NOT NULL,
  `startedAt` timestamp NOT NULL,
  `finishedAt` timestamp NULL,
  `machineName` varchar(128) NOT NULL DEFAULT '',
  `destination` varchar(512) NOT NULL DEFAULT '',
  `scope` varchar(128) NOT NULL DEFAULT '',
  `status` enum('running','success','partial','failed') NOT NULL DEFAULT 'running',
  `fileCount` int NOT NULL DEFAULT 0,
  `totalBytes` bigint NOT NULL DEFAULT 0,
  `snapshotFolder` varchar(512) NOT NULL DEFAULT '',
  `errorSummary` varchar(2000) NOT NULL DEFAULT '',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `backup_runs_id` PRIMARY KEY(`id`),
  KEY `backup_runs_started_idx` (`startedAt`),
  KEY `backup_runs_status_started_idx` (`status`, `startedAt`)
);
CREATE TABLE IF NOT EXISTS `cabinet_dealz`.`backup_settings` (
  `id` int NOT NULL,
  `dailyTime` varchar(5) NOT NULL DEFAULT '03:00',
  `timezone` varchar(64) NOT NULL DEFAULT 'America/New_York',
  `retentionDays` int NOT NULL DEFAULT 90,
  `updatedBy` int NULL,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `backup_settings_id` PRIMARY KEY(`id`)
);
INSERT IGNORE INTO `cabinet_dealz`.`backup_settings` (`id`, `dailyTime`, `timezone`, `retentionDays`) VALUES (1, '03:00', 'America/New_York', 90);
