-- Migration 0240. Journal idx 239, when 1796100000000. It follows
-- 0239_countertop_quote_addresses, the last entry in the journal.
-- TiDB SQL editor statements are in
-- docs/sql/0294_countertop_quote_order_plans.tidb.sql.
--
-- Run the TiDB file before deploying this code. The drizzle schema now declares
-- these columns, so the countertop quote list selects them; against a database
-- that has not been migrated yet that query fails with "unknown column".
--
-- A countertop quote is now created from the order that contains the
-- countertop, not only from the standalone form, so the row records:
--   orderRequestId   the placed order request the countertop belongs to
--   kitchenDesignId  the saved 3D designer plan the top is priced against
--   sourceType       "form" for the standalone request, "order" for an order
--   countertopPlan   the countertop bundle (material, edge, cutouts, lines)
--   designerPlan     the saved layout snapshot behind the countertop
--   fabricatorEmail  added when a deal with the shop is negotiated
--
-- An order can carry no customer email, and the owner fills the fabricator's
-- email in when they negotiate. The quote must exist before that, so the
-- contact email is relaxed to nullable.
ALTER TABLE `countertop_quotes` MODIFY COLUMN `contactEmail` varchar(320) NULL;--> statement-breakpoint
ALTER TABLE `countertop_quotes` ADD COLUMN `fabricatorEmail` varchar(320);--> statement-breakpoint
ALTER TABLE `countertop_quotes` ADD COLUMN `orderRequestId` int;--> statement-breakpoint
ALTER TABLE `countertop_quotes` ADD COLUMN `kitchenDesignId` int;--> statement-breakpoint
ALTER TABLE `countertop_quotes` ADD COLUMN `sourceType` enum('form','order') NOT NULL DEFAULT 'form';--> statement-breakpoint
ALTER TABLE `countertop_quotes` ADD COLUMN `countertopPlan` json;--> statement-breakpoint
ALTER TABLE `countertop_quotes` ADD COLUMN `designerPlan` json;--> statement-breakpoint
CREATE INDEX `countertop_quotes_order_request_idx` ON `countertop_quotes` (`orderRequestId`);
