-- TiDB SQL editor version. Numbered 0280. Run after 0279.
-- Paste each numbered block on its own. One statement per block.
-- Every table is cabinet_dealz.<table>. No reserved-word aliases.
-- This file only adds columns. It inserts nothing, updates no rows, and deletes
-- nothing. There is no backfill. Existing door styles stay NULL and keep their
-- current color order (wizard record, accepted render, catalog photo). Do not
-- force them onto the supplier photo.
--
-- Run this BEFORE deploying the cabinet-backend door-color-source column PR:
-- doorStyles.list and listForAdmin select these columns, so those queries error
-- until the columns exist.
--
-- Why: the door editor's color source selector (cabinet-frontend PR 389) has four
-- mutually exclusive options — Original image, Approved AI image, Sherwin-Williams,
-- and Hex. Sherwin-Williams and Hex only count after Confirm. Until this column
-- exists, the confirmed choice is saved only in the browser where it was made.
-- These columns hold that admin-confirmed choice so every shopper's Designer sees
-- the same 3D door faces and editor preview. Audits and swatches are unchanged.

-- 1. Read-only: how many door styles exist. After this file runs, all of them
--    keep NULL in the new columns until an admin saves a confirmed choice.
--    Safe to run twice. Nothing is changed. This block does not read the new
--    columns, so it works before they are added.
SELECT COUNT(*) AS doorStyleCount
FROM cabinet_dealz.door_styles;

-- 2. The confirmed color source mode. Nullable: NULL means "nothing chosen", and
--    the door keeps its current color order. Allowed values, when set:
--      'original-image'      supplier-uploaded door photo, chosen explicitly
--      'approved-ai-image'   the accepted AI render for this style
--      'sherwin-williams'    a confirmed Sherwin-Williams stain or paint chip
--      'hex'                 a confirmed hand-picked hex
--    Only confirmed choices are ever written. An unconfirmed Sherwin-Williams or
--    Hex pick is never stored.
ALTER TABLE cabinet_dealz.door_styles
  ADD COLUMN IF NOT EXISTS doorColorSource VARCHAR(32) NULL;

-- 3. The confirmed value for that mode. NULL for original-image, approved-ai-image,
--    and for unset rows. For hex: {"hex":"#224466"}. For sherwin-williams: the
--    confirmed chip (finish, code, label, hex, woodSpecies, grainDirection,
--    profileImageUrl).
ALTER TABLE cabinet_dealz.door_styles
  ADD COLUMN IF NOT EXISTS doorColorSourceValue JSON NULL;

-- 4. When the confirmed choice was last saved. NULL when unset. This is not a
--    table-wide updatedAt; other door style edits do not touch it.
ALTER TABLE cabinet_dealz.door_styles
  ADD COLUMN IF NOT EXISTS doorColorSourceUpdatedAt TIMESTAMP NULL;

-- 5. Read-only check: confirm the three columns exist on door_styles.
SELECT
  column_name AS addedColumn,
  data_type AS columnType,
  is_nullable AS nullable
FROM information_schema.columns
WHERE table_schema = 'cabinet_dealz'
  AND table_name = 'door_styles'
  AND column_name IN ('doorColorSource', 'doorColorSourceValue', 'doorColorSourceUpdatedAt')
ORDER BY column_name;
