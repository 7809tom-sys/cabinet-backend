-- Migration 0237. Journal idx 236, when 1795800000000. It follows
-- 0236_affiliate_marketing_hub_content, the last entry in the journal.
-- TiDB SQL editor statements are in
-- docs/sql/0269_affiliate_free_usage.tidb.sql.
--
-- Numbering note: 0237 is the next free drizzle number on this branch. Other
-- open branches may take 0237 first, in which case this file and its journal
-- entry must be renumbered — nothing here depends on the number itself.
--
-- The affiliate free-use ledger: one row per design-tool use spent by a store
-- whose membership is not active. Five uses in total across saved designs,
-- Auto Design runs, and photo renders (shared/affiliateFreeUsage.ts). A ledger,
-- not a count of existing designs, so deleting a design cannot reset the cap.
-- Additive only: one new table. No existing table is altered and no row is
-- written, updated, or deleted.
CREATE TABLE IF NOT EXISTS `affiliate_free_usage` (
  `id` int NOT NULL AUTO_INCREMENT,
  `affiliateId` int NOT NULL,
  `kind` enum('design','auto_design','photo_render') NOT NULL,
  `refId` int DEFAULT NULL,
  `userId` int DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `affiliate_free_usage_affiliate_kind_idx` (`affiliateId`,`kind`),
  KEY `affiliate_free_usage_created_at_idx` (`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
