-- TiDB SQL editor version. Numbered 0247. Run after 0246.
-- Paste each numbered block on its own. One statement per block.
-- Every table is cabinet_dealz.<table>. No reserved-word aliases.
-- This file only adds columns. It inserts nothing, updates no rows, and deletes
-- nothing. Safe to re-run: ADD COLUMN IF NOT EXISTS.
--
-- Why: the warehouse photographs the finished pallet before it ships. The photo
-- is stored with the platform's existing file storage; these columns only keep
-- its URL and who uploaded it.
--
-- Nothing is emailed and nothing is published by these columns. The photo is
-- returned to an authorized order reader (admin, the affiliate whose storefront
-- took the order, the routed distributor, or the signed-in customer who owns
-- the order). Until this runs, an upload is refused with a clear message and
-- the rest of the order detail keeps working.

-- 1
ALTER TABLE cabinet_dealz.order_requests
  ADD COLUMN IF NOT EXISTS palletPhotoUrl VARCHAR(1024) NULL;

-- 2
ALTER TABLE cabinet_dealz.order_requests
  ADD COLUMN IF NOT EXISTS palletPhotoUploadedAt TIMESTAMP NULL;

-- 3
ALTER TABLE cabinet_dealz.order_requests
  ADD COLUMN IF NOT EXISTS palletPhotoUploadedBy VARCHAR(256) NULL;

-- 4 read-only check. Expect 3.
SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'cabinet_dealz'
    AND TABLE_NAME = 'order_requests'
    AND COLUMN_NAME IN ('palletPhotoUrl', 'palletPhotoUploadedAt', 'palletPhotoUploadedBy');

-- 5 read-only check. How many orders already have a pallet photo.
SELECT COUNT(*) AS ordersWithPalletPhoto
FROM cabinet_dealz.order_requests
WHERE palletPhotoUrl IS NOT NULL;
