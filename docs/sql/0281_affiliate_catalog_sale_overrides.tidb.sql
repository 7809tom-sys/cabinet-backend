-- Affiliate sale overrides for Pelican and Hardware Resources.
-- Numbered 0281. Run after 0280 and BEFORE deploying the affiliate checkout
-- price change. Affiliate Pelican and hardware orders select these columns.
-- Owner-store hardware orders do not. Paste each numbered block on its own
-- in the TiDB SQL editor. One statement per block. Every table is
-- cabinet_dealz.<table>. Not applied by the application, and never run by CI.
-- Tom runs it by hand.
--
-- Nothing here updates or deletes existing prices. A NULL affiliate percent
-- or NULL fixed price means "not set": checkout keeps the automatic product
-- price. Retail markups are not changed.
--
-- Checkout precedence for an affiliate store:
--   1. per-item affiliateSalePrice, when it is a positive dollar amount
--   2. else category affiliateMarkupBps: cost × (1 + bps/10000)
--   3. else the existing product price
--      Pelican: admin retail, or authorized cost × the category retail markup
--      Hardware: supplier list × (1 + that store's hardwareMarkupBps)
-- Zero and negative results are rejected.

-- 1. Pelican category affiliate percent, separate from markupBps (retail).
ALTER TABLE cabinet_dealz.pelican_category_markups
  ADD COLUMN IF NOT EXISTS affiliateMarkupBps INT NULL;

-- 2. Who last set or cleared that Pelican category percent, and when.
ALTER TABLE cabinet_dealz.pelican_category_markups
  ADD COLUMN IF NOT EXISTS affiliateMarkupUpdatedAt TIMESTAMP NULL;

-- 3
ALTER TABLE cabinet_dealz.pelican_category_markups
  ADD COLUMN IF NOT EXISTS affiliateMarkupUpdatedByOpenId VARCHAR(64) NULL;

-- 4. Optional fixed affiliate sale price on one Pelican product.
ALTER TABLE cabinet_dealz.pelican_products
  ADD COLUMN IF NOT EXISTS affiliateSalePrice DECIMAL(10, 2) NULL;

-- 5
ALTER TABLE cabinet_dealz.pelican_products
  ADD COLUMN IF NOT EXISTS affiliateSalePriceUpdatedAt TIMESTAMP NULL;

-- 6
ALTER TABLE cabinet_dealz.pelican_products
  ADD COLUMN IF NOT EXISTS affiliateSalePriceUpdatedByOpenId VARCHAR(64) NULL;

-- 7. Optional fixed affiliate sale price on one Hardware Resources product.
ALTER TABLE cabinet_dealz.vendor_products
  ADD COLUMN IF NOT EXISTS affiliateSalePrice DECIMAL(10, 2) NULL;

-- 8
ALTER TABLE cabinet_dealz.vendor_products
  ADD COLUMN IF NOT EXISTS affiliateSalePriceUpdatedAt TIMESTAMP NULL;

-- 9
ALTER TABLE cabinet_dealz.vendor_products
  ADD COLUMN IF NOT EXISTS affiliateSalePriceUpdatedByOpenId VARCHAR(64) NULL;

-- 10. One row per hardware category. No retail markup lives here. affiliateMarkupBps
--     NULL means the category has no affiliate percent yet.
CREATE TABLE IF NOT EXISTS cabinet_dealz.hardware_category_affiliate_markups (
  id INT NOT NULL AUTO_INCREMENT,
  category VARCHAR(128) NOT NULL,
  affiliateMarkupBps INT NULL,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updatedByOpenId VARCHAR(64) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY hardware_category_affiliate_markups_category_uq (category)
);
