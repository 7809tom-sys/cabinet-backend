-- Room-scene photo on each Pelican product. Separate from imageUrl (catalog card)
-- and materialImageUrl (Designer swatch). door_styles.roomSceneImageUrl is a
-- different table and is not reused.
-- Numbered 0242. Run after 0241 and BEFORE merging or deploying this release.
-- pelican.adminList, pelican.bySlug, and pelican.byCategory select every
-- pelican_products column, so those queries error until this column exists.
-- Paste each numbered block on its own in the TiDB SQL editor.
-- One statement per block. Do not paste this into an automatic migration.
-- The table is cabinet_dealz.pelican_products. Safe to re-run: IF NOT EXISTS.

-- 1
ALTER TABLE cabinet_dealz.pelican_products ADD COLUMN IF NOT EXISTS roomSceneImageUrl VARCHAR(512) NULL;

-- 2
COMMIT;

-- 3
SELECT 'COMMITTED';
