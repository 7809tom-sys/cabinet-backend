-- TiDB SQL editor version. Numbered 0284. Run after 0283.
-- Paste each numbered block on its own. One statement per block.
-- Every table is cabinet_dealz.<table>.
-- Nothing here deletes anything. Blocks 1, 2, 3, 6 and 7 are read-only.
-- Blocks 4 and 5 only add two nullable columns. Block 8 is the ONE optional
-- backfill UPDATE; it only fills the two new columns and is safe to re-run.
--
-- Why (Tom, Nov 23 2026): every CRM contact gets a date stamp when their
-- initial design is saved, and the dates are stamped automatically.
-- A CRM contact is a crm_deals row. Two new dates:
--   firstDesignSavedAt  set once, the first time a design is saved for the
--                       contact. Never overwritten afterwards.
--   lastDesignSavedAt   moved forward on every save of a linked design.
-- The site writes both with the database clock (NOW()), never a browser time.
--
-- Order is flexible. The cabinet-backend PR checks information_schema before it
-- reads or writes these columns, so the site keeps working before this runs;
-- stamping simply starts within a minute after blocks 4 and 5 run, with no
-- redeploy. Contacts saved before that get their dates from block 8.

-- 1. Read-only: how many CRM contacts exist, and how many have at least one
--    linked saved design. Does not read the new columns, so it works before
--    they are added. Safe to run twice.
SELECT
  (SELECT COUNT(*) FROM cabinet_dealz.crm_deals) AS crmContacts,
  (SELECT COUNT(DISTINCT l.dealId)
     FROM cabinet_dealz.crm_deal_designs l
     JOIN cabinet_dealz.kitchen_designs kd ON kd.id = l.designId) AS contactsWithSavedDesign;

-- 2. Read-only: confirm createdAt and updatedAt on crm_deals are already
--    automatic. Expected: createdAt COLUMN_DEFAULT CURRENT_TIMESTAMP;
--    updatedAt COLUMN_DEFAULT CURRENT_TIMESTAMP with EXTRA
--    "DEFAULT_GENERATED on update CURRENT_TIMESTAMP" (wording varies).
--    Nothing to change if so. Report back if either is missing.
SELECT column_name AS col, column_type AS type, column_default AS defaultValue, extra
FROM information_schema.columns
WHERE table_schema = 'cabinet_dealz'
  AND table_name = 'crm_deals'
  AND column_name IN ('createdAt', 'updatedAt', 'closedAt', 'designSyncedAt', 'nextFollowUpAt')
ORDER BY column_name;

-- 3. Read-only: the two new columns are not there yet (expect 0 rows the first
--    time, 2 rows after blocks 4 and 5).
SELECT column_name AS col
FROM information_schema.columns
WHERE table_schema = 'cabinet_dealz'
  AND table_name = 'crm_deals'
  AND column_name IN ('firstDesignSavedAt', 'lastDesignSavedAt');

-- 4. First design saved. Nullable: NULL means no design saved yet.
ALTER TABLE cabinet_dealz.crm_deals
  ADD COLUMN IF NOT EXISTS firstDesignSavedAt TIMESTAMP NULL DEFAULT NULL;

-- 5. Last design saved. Nullable: NULL means no design saved yet.
ALTER TABLE cabinet_dealz.crm_deals
  ADD COLUMN IF NOT EXISTS lastDesignSavedAt TIMESTAMP NULL DEFAULT NULL;

-- 6. Read-only check: both columns exist now (expect 2 rows).
SELECT column_name AS col, data_type AS type, is_nullable AS nullable
FROM information_schema.columns
WHERE table_schema = 'cabinet_dealz'
  AND table_name = 'crm_deals'
  AND column_name IN ('firstDesignSavedAt', 'lastDesignSavedAt')
ORDER BY column_name;

-- ───────────────── OPTIONAL BACKFILL (existing contacts) ─────────────────
-- 7. Read-only preview: how many contacts block 8 would fill or move.
--    firstToFill = contacts with a linked design but no first date yet.
--    lastToMove  = contacts whose last date is empty or older than their
--                  newest linked design.
SELECT
  SUM(CASE WHEN d.firstDesignSavedAt IS NULL THEN 1 ELSE 0 END) AS firstToFill,
  SUM(CASE WHEN d.lastDesignSavedAt IS NULL OR s.lastAt > d.lastDesignSavedAt THEN 1 ELSE 0 END) AS lastToMove,
  MIN(s.firstAt) AS earliestFirstDesign,
  MAX(s.lastAt) AS latestDesignSave
FROM cabinet_dealz.crm_deals d
JOIN (
  SELECT l.dealId AS dealId,
         MIN(kd.createdAt) AS firstAt,
         MAX(GREATEST(kd.createdAt, kd.updatedAt)) AS lastAt
  FROM cabinet_dealz.crm_deal_designs l
  JOIN cabinet_dealz.kitchen_designs kd ON kd.id = l.designId
  GROUP BY l.dealId
) s ON s.dealId = d.id;

-- 8. BACKFILL. Fills firstDesignSavedAt from each contact's earliest linked
--    saved design (kitchen_designs.createdAt) only where it is still NULL, and
--    moves lastDesignSavedAt to the newest linked design save if that is later.
--    Never overwrites an existing first date. Never clears anything.
--    "updatedAt = d.updatedAt" keeps each contact's updatedAt (board order and
--    "Last activity") exactly as it was.
--    Safe to re-run: a second run changes 0 rows.
UPDATE cabinet_dealz.crm_deals d
JOIN (
  SELECT l.dealId AS dealId,
         MIN(kd.createdAt) AS firstAt,
         MAX(GREATEST(kd.createdAt, kd.updatedAt)) AS lastAt
  FROM cabinet_dealz.crm_deal_designs l
  JOIN cabinet_dealz.kitchen_designs kd ON kd.id = l.designId
  GROUP BY l.dealId
) s ON s.dealId = d.id
SET d.firstDesignSavedAt = COALESCE(d.firstDesignSavedAt, s.firstAt),
    d.lastDesignSavedAt = CASE
      WHEN d.lastDesignSavedAt IS NULL OR s.lastAt > d.lastDesignSavedAt THEN s.lastAt
      ELSE d.lastDesignSavedAt
    END,
    d.updatedAt = d.updatedAt;

-- 9. Read-only check after the backfill: firstToFill and lastToMove in block 7
--    should now be 0. Re-run block 7.
