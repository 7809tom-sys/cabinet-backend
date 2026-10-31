-- TiDB SQL editor version of drizzle/0226_distributor_go_live_acceptance.sql.
-- Journal idx 225. Paste each numbered block on its own.
-- One statement per block. No statement-breakpoint markers.
-- Safe to re-run: IF NOT EXISTS, tables qualified as cabinet_dealz.<table>.
-- Safe to run before OR after deploying this PR: no public or admin list reads these columns;
-- only the Go live procedures do, so run this before anyone clicks Go live.

-- 1
ALTER TABLE cabinet_dealz.distributors ADD COLUMN IF NOT EXISTS goLiveAcceptedByUserId INT NULL;

-- 2
ALTER TABLE cabinet_dealz.distributors ADD COLUMN IF NOT EXISTS goLiveAcceptedAt TIMESTAMP NULL DEFAULT NULL;

-- 3
ALTER TABLE cabinet_dealz.distributors ADD COLUMN IF NOT EXISTS goLiveTermsVersion VARCHAR(32) NULL;

-- 4
ALTER TABLE cabinet_dealz.distributors ADD COLUMN IF NOT EXISTS goLiveTermsSnapshot JSON NULL;

-- 5 read-only check. Expect go_live_columns = 4.
SELECT COUNT(*) AS go_live_columns
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'cabinet_dealz'
  AND TABLE_NAME = 'distributors'
  AND COLUMN_NAME IN ('goLiveAcceptedByUserId', 'goLiveAcceptedAt', 'goLiveTermsVersion', 'goLiveTermsSnapshot');
