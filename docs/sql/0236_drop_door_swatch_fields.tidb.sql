-- TiDB SQL editor version. Numbered 0236. Run after 0235.
-- Paste each numbered block on its own. One statement per block.
-- Every table is cabinet_dealz.<table>. No reserved-word aliases.
-- Do not run this from an application. The owner pastes it in the TiDB editor
-- AFTER both the cabinet-backend and cabinet-frontend PRs that stop reading
-- swatchCode and swatchHex are deployed.
--
-- Drops the unused Sherwin-Williams code and swatch hex.
-- Leaves door_styles.renderHex, door_styles.doorShape,
-- site_settings.renderExposure, and site_settings.colorMatchDeltaE.
-- Safe to re-run: DROP COLUMN IF EXISTS.
-- Block 3 is a read-only check. Expect 0.

-- 1
ALTER TABLE cabinet_dealz.door_styles DROP COLUMN IF EXISTS swatchCode;

-- 2
ALTER TABLE cabinet_dealz.door_styles DROP COLUMN IF EXISTS swatchHex;

-- 3 read-only check. Expect 0.
SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='cabinet_dealz' AND TABLE_NAME='door_styles' AND COLUMN_NAME IN ('swatchCode','swatchHex');
