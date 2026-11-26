-- Migration 0239. Journal idx 238, when 1796000000000. It follows
-- 0238_affiliate_design_grants, the last entry in the journal.
-- TiDB SQL editor statements are in
-- docs/sql/0292_countertop_quote_addresses.tidb.sql.
--
-- Run the TiDB file before deploying this code. The drizzle schema now declares
-- these columns, so a quote list query selects them; against a database that has
-- not been migrated yet that query fails with "unknown column".
--
-- A countertop job moves material through two addresses, so a quote now records
-- both legs:
--   jobSiteAddress      the homeowner's address, where the finished top is installed
--                       and the fabricator delivers. Required on new quotes.
--   fabricatorAddress   the shop the slab ships to for fabrication. A snapshot
--                       captured when a shop is assigned, because shop addresses
--                       change and the job must keep the address it was quoted against.
--
-- Additive and nullable: every existing quote predates these fields, so a missing
-- value reads as "not collected yet" rather than an error.
ALTER TABLE `countertop_quotes` ADD COLUMN `jobSiteAddress` varchar(512);--> statement-breakpoint
ALTER TABLE `countertop_quotes` ADD COLUMN `jobSiteAddressVerified` boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE `countertop_quotes` ADD COLUMN `fabricatorName` varchar(200);--> statement-breakpoint
ALTER TABLE `countertop_quotes` ADD COLUMN `fabricatorAddress` varchar(512);
