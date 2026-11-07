-- Migration 0238. Journal idx 237, when 1795900000000. It follows
-- 0237_affiliate_free_usage, the last entry in the journal.
-- TiDB SQL editor statements are in
-- docs/sql/0270_affiliate_design_grants.tidb.sql.
--
-- Numbering note: 0238 is the next free drizzle number on this branch. Other
-- open branches may take 0238 first, in which case this file and its journal
-- entry must be renumbered — nothing here depends on the number itself.
--
-- The admin "backdoor" design allowance: one grant row per affiliate store,
-- giving that store extra design uses on top of the free five, with
-- designCount stored explicitly so the admin view and the affiliate's usage
-- response can both say "Extra designs: 5 (3 left)". Renewing resets
-- usedSinceGrant and can change designCount. contactEmails is the
-- comma-separated list of the emails the grant belongs to, read from the
-- affiliate's own row when it is issued.
--
-- Additive only: one new table. No existing table is altered and no existing
-- row is written, updated, or deleted.
CREATE TABLE IF NOT EXISTS `affiliate_design_grants` (
  `id` int NOT NULL AUTO_INCREMENT,
  `affiliateId` int NOT NULL,
  `designCount` int NOT NULL DEFAULT 0,
  `usedSinceGrant` int NOT NULL DEFAULT 0,
  `contactEmails` text,
  `grantedBy` varchar(320),
  `grantedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `renewedAt` timestamp NULL,
  `renewedBy` varchar(320),
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `affiliate_design_grants_affiliate_uq` (`affiliateId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
