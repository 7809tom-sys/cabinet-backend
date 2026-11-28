-- 0294. Countertop quote order + both plans.
-- Companion to drizzle/0240_countertop_quote_order_plans.sql (journal idx 239).
-- Run this in the TiDB SQL editor before deploying the code that selects these
-- columns: the quote list now reads orderRequestId, kitchenDesignId,
-- sourceType, countertopPlan and designerPlan.
--
-- Every statement is additive, so the running site keeps working while the
-- deploy rolls out. Existing standalone form requests keep sourceType = 'form'.
-- contactEmail becomes nullable because an order-created quote can exist before
-- the fabricator's email is negotiated.
ALTER TABLE `countertop_quotes` MODIFY COLUMN `contactEmail` varchar(320) NULL;
ALTER TABLE `countertop_quotes` ADD COLUMN `fabricatorEmail` varchar(320);
ALTER TABLE `countertop_quotes` ADD COLUMN `orderRequestId` int;
ALTER TABLE `countertop_quotes` ADD COLUMN `kitchenDesignId` int;
ALTER TABLE `countertop_quotes` ADD COLUMN `sourceType` enum('form','order') NOT NULL DEFAULT 'form';
ALTER TABLE `countertop_quotes` ADD COLUMN `countertopPlan` json;
ALTER TABLE `countertop_quotes` ADD COLUMN `designerPlan` json;
CREATE INDEX `countertop_quotes_order_request_idx` ON `countertop_quotes` (`orderRequestId`);
