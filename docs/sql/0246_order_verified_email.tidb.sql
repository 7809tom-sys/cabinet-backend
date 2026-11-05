-- TiDB SQL editor version of drizzle/0232_order_verified_email.sql.
-- Numbered 0246. Run after 0245.
-- Paste each numbered block on its own. One statement per block.
-- Every table is cabinet_dealz.<table>. No reserved-word aliases.
-- This file only adds one column. It inserts nothing, updates no rows, and
-- deletes nothing. Safe to re-run (IF NOT EXISTS).
--
-- Why: the customer "your order has been verified" email must go out exactly
-- once per order. The column is the claim marker: the app sets it with a
-- conditional UPDATE before sending, so a second click on Order verified is a
-- no-op. Null means "not emailed yet". Until this runs, verification still
-- works and simply logs that the email could not be marked.

-- 1
ALTER TABLE cabinet_dealz.order_requests
  ADD COLUMN IF NOT EXISTS orderVerifiedEmailSentAt TIMESTAMP NULL;

-- 2 read-only check. Expect 1.
SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'cabinet_dealz'
    AND TABLE_NAME = 'order_requests'
    AND COLUMN_NAME = 'orderVerifiedEmailSentAt';

-- 3 read-only check. How many orders already carry the marker.
SELECT COUNT(*) AS alreadyEmailed
FROM cabinet_dealz.order_requests
WHERE orderVerifiedEmailSentAt IS NOT NULL;
