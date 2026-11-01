-- Public catalog lookup indexes.
-- Numbered 0243. Run after 0242.
-- Paste each numbered block on its own in the TiDB SQL editor.
-- One statement per block. Do not paste this into an automatic migration.
-- Every table is cabinet_dealz.<table>. Safe to re-run: IF NOT EXISTS.
-- These indexes do not change query results. The app boots without them.
-- Run them when convenient. They make category pages and cabinet price
-- checks cheaper as the tables grow. Today's latency is mostly the network
-- round trip, which the app now overlaps; the indexes keep each of those
-- queries from becoming a table scan later.
-- Nothing is deleted or rewritten.

-- 1
CREATE INDEX IF NOT EXISTS pelican_products_category_catalog_idx
  ON cabinet_dealz.pelican_products (category, isActive, showInCatalog, isPopular, popularRank);

-- 2
COMMIT;

-- 3
CREATE INDEX IF NOT EXISTS pelican_products_category_designer_idx
  ON cabinet_dealz.pelican_products (category, isActive, showInDesigner, isPopular, popularRank);

-- 4
COMMIT;

-- 5
CREATE INDEX IF NOT EXISTS distributor_skus_cabinet_sellable_idx
  ON cabinet_dealz.distributor_skus (cabinetId, isAvailable, isPublished);

-- 6
COMMIT;

-- 7
CREATE INDEX IF NOT EXISTS distributor_skus_style_sellable_idx
  ON cabinet_dealz.distributor_skus (styleId, isAvailable, isPublished);

-- 8
COMMIT;

-- 9
SELECT 'COMMITTED';
