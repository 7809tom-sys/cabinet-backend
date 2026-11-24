-- TiDB SQL editor version. The application asks for this file by name.
-- Paste each numbered block on its own. One statement per block.
-- Every table is cabinet_dealz.<table>. No reserved-word aliases.
-- This file only adds columns. It inserts nothing, updates no rows, and deletes
-- nothing. There is no backfill. Existing door styles stay NULL until an admin
-- saves a profile or a provider column. Safe to re-run: ADD COLUMN IF NOT EXISTS.
-- Not applied by the application, and never run by CI. Tom runs it by hand.
--
-- docs/sql/0281_affiliate_catalog_sale_overrides.tidb.sql is a different change
-- that already uses the number 0281. It touches affiliate price tables. This
-- file touches door_styles only. Run them in either order.
--
-- Run this BEFORE using Choose as official or saving an AI door column.
-- doorStyles.saveAiProfile writes aiProfileModel, aiProfileText and
-- aiProfileImageUrl. It also writes aiProfileRenderHex when that column
-- exists, and copies a #rrggbb value onto the existing renderHex column.
-- If those three profile columns are missing, Choose as official answers
-- PRECONDITION_FAILED and names this file.
-- doorStyles.saveAiColumn writes aiColumns. If aiColumns is missing, that
-- save answers PRECONDITION_FAILED with: The AI door columns are not in the
-- database yet. Run docs/sql/0281_ai_door_profile.tidb.sql.
-- doorStyles.listForAdmin reads aiColumns and returns NULL when the column
-- is missing or the row has none, so the list itself keeps working.
--
-- Generate stores a PNG under door-style-images/ai-generated/ and returns a
-- /manus-storage/... URL. It does not write the door style row. Choose as
-- official is what stores the winning description, image, and sampled colour.
-- aiColumns keeps the gpt, claude, and gemini columns side by side:
--   { "gpt"?: Col, "claude"?: Col, "gemini"?: Col }
--   Col = { "imageUrl": string|null, "model": string|null, "text": string|null,
--           "renderHex": string|null, "generatedAt": string (ISO) }

-- 1. Read-only: how many door styles exist. After this file runs, all of them
--    keep NULL in the new columns until an admin saves. Safe to run twice.
--    This block does not read the new columns, so it works before they are added.
SELECT COUNT(*) AS doorStyleCount
FROM cabinet_dealz.door_styles;

-- 2. Which model wrote the official AI profile: gpt, claude, or gemini.
ALTER TABLE cabinet_dealz.door_styles
  ADD COLUMN IF NOT EXISTS aiProfileModel VARCHAR(32) NULL;

-- 3. The official AI description chosen in the editor.
ALTER TABLE cabinet_dealz.door_styles
  ADD COLUMN IF NOT EXISTS aiProfileText TEXT NULL;

-- 4. The official generated door image. A /manus-storage/... URL.
ALTER TABLE cabinet_dealz.door_styles
  ADD COLUMN IF NOT EXISTS aiProfileImageUrl VARCHAR(1024) NULL;

-- 5. The sampled colour of that official image, stored with the profile.
--    Choose as official also copies a #rrggbb value onto renderHex, which the
--    Designer paints. This column keeps the profile's own colour.
ALTER TABLE cabinet_dealz.door_styles
  ADD COLUMN IF NOT EXISTS aiProfileRenderHex VARCHAR(16) NULL;

-- 6. The three provider columns, one JSON object. NULL until the first
--    saveAiColumn. Saving one provider replaces only that key.
ALTER TABLE cabinet_dealz.door_styles
  ADD COLUMN IF NOT EXISTS aiColumns JSON NULL;

-- 7. Read-only check: confirm the five columns exist on door_styles.
--    Expect five rows, each nullable.
SELECT
  column_name AS addedColumn,
  data_type AS columnType,
  is_nullable AS nullable
FROM information_schema.columns
WHERE table_schema = 'cabinet_dealz'
  AND table_name = 'door_styles'
  AND column_name IN (
    'aiProfileModel',
    'aiProfileText',
    'aiProfileImageUrl',
    'aiProfileRenderHex',
    'aiColumns'
  )
ORDER BY column_name;
