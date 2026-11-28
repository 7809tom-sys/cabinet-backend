-- 0296. Countertop quote fabricator cost.
-- Companion to drizzle/0241_countertop_quote_fabricator_cost.sql (journal idx 240).
-- Run before deploying the code that reads fabricatorCost.
ALTER TABLE `countertop_quotes` ADD COLUMN `fabricatorCost` decimal(10, 2);
