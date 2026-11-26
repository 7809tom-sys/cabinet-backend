-- TiDB SQL editor version of the countertop quote address columns.
-- Paste each numbered block on its own. One statement per block.
-- Safe to re-run: IF NOT EXISTS, tables qualified as cabinet_dealz.<table>.
--
-- A countertop job moves material through two addresses:
--
--   homeowner / job site  ->  where the finished top is installed and the
--                             fabricator delivers. Collected on the quote.
--
--   fabrication shop      ->  where the slab ships to be cut. Captured when a
--                             shop is assigned, not by the customer.
--
-- Together those two legs are the complete cycle: slab to the shop, finished top
-- to the home.
--
-- Quotes created before this file have neither address. They are never treated as
-- incomplete; the admin list shows them as "not collected".

-- 1
ALTER TABLE cabinet_dealz.countertop_quotes ADD COLUMN IF NOT EXISTS jobSiteAddress VARCHAR(512) NULL;

-- 2
ALTER TABLE cabinet_dealz.countertop_quotes ADD COLUMN IF NOT EXISTS jobSiteAddressVerified TINYINT(1) NOT NULL DEFAULT 0;

-- 3
ALTER TABLE cabinet_dealz.countertop_quotes ADD COLUMN IF NOT EXISTS fabricatorName VARCHAR(200) NULL;

-- 4
ALTER TABLE cabinet_dealz.countertop_quotes ADD COLUMN IF NOT EXISTS fabricatorAddress VARCHAR(512) NULL;
