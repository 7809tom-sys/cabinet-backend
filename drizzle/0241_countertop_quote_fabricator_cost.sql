-- Migration 0241. Journal idx 240, when 1796200000000. It follows
-- 0240_countertop_quote_order_plans, the last entry in the journal.
-- TiDB SQL editor statements are in
-- docs/sql/0296_countertop_quote_fabricator_cost.tidb.sql.
--
-- The quote card now shows the fabricator's cost per slab next to the sales
-- price per slab, so the owner can see the spread while negotiating. Nullable:
-- old quotes simply have no cost recorded yet.
ALTER TABLE `countertop_quotes` ADD COLUMN `fabricatorCost` decimal(10, 2);
