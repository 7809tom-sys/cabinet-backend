-- TiDB SQL editor version. Numbered 0285. Run after 0284 (or any time: it only adds two tables).
-- Paste each numbered block on its own. One statement per block.
-- Every table is cabinet_dealz.<table>. Safe to run twice (IF NOT EXISTS / INSERT IGNORE).
-- This file creates two new tables and one settings row. It changes and deletes nothing that exists.
--
-- Why: the admin Backups tab shows the backup log (backup_runs) and the backup schedule
-- (backup_settings). Until these exist, the tab says "needs database update" instead of failing.

-- 1. Backup log: one row per backup run, written by the PC script through /api/backups/report.
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

-- 2. Backup schedule: a single row, id = 1.
CREATE TABLE IF NOT EXISTS `cabinet_dealz`.`backup_settings` (
  `id` int NOT NULL,
  `dailyTime` varchar(5) NOT NULL DEFAULT '03:00',
  `timezone` varchar(64) NOT NULL DEFAULT 'America/New_York',
  `retentionDays` int NOT NULL DEFAULT 90,
  `updatedBy` int NULL,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `backup_settings_id` PRIMARY KEY(`id`)
);

-- 3. The default schedule row (3:00 AM Eastern, keep 90 days). Does nothing if it already exists.
INSERT IGNORE INTO `cabinet_dealz`.`backup_settings` (`id`, `dailyTime`, `timezone`, `retentionDays`) VALUES (1, '03:00', 'America/New_York', 90);

-- 4. Read-only check. Should list both tables.
SELECT TABLE_NAME FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'cabinet_dealz' AND TABLE_NAME IN ('backup_runs', 'backup_settings');
