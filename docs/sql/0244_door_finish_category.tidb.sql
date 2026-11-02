-- TiDB SQL editor version of the door finish category.
-- Numbered 0244. Run after 0243.
-- Paste each numbered block on its own. One statement per block.
-- Every table is cabinet_dealz.<table>. No reserved-word aliases.
-- Safe to re-run: ADD COLUMN IF NOT EXISTS.
-- Apply this before deploying the cabinet-backend finish-category fields.
-- This file only adds columns. It does not write hex values.
-- Hex updates are a separate reviewed script from the dry-run
-- (docs/proofs/swatch-hex/apply.sql). Do not run that until you approve it.
--
-- finishCategory is paint or stain.
-- paint is an opaque tint on the painted grain.
-- stain is a translucent tint over the wood grain.
-- renderHex stays the door's own color. grainLightHex and grainDarkHex
-- are the light and dark ends of that same color.

-- 1
ALTER TABLE cabinet_dealz.door_styles
  ADD COLUMN IF NOT EXISTS finishCategory VARCHAR(16) NULL;

-- 2
ALTER TABLE cabinet_dealz.door_styles
  ADD COLUMN IF NOT EXISTS grainLightHex VARCHAR(7) NULL;

-- 3
ALTER TABLE cabinet_dealz.door_styles
  ADD COLUMN IF NOT EXISTS grainDarkHex VARCHAR(7) NULL;

-- 4 read-only check. Expect 3.
SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'cabinet_dealz'
    AND TABLE_NAME = 'door_styles'
    AND COLUMN_NAME IN ('finishCategory','grainLightHex','grainDarkHex');
