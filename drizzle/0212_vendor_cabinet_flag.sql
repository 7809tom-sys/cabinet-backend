-- Migration 0212. The file number stays 0212.
-- Journal entry is appended after 0211_sales_forecast_vendor_portal
-- (idx 213, when 1793500000000) so it sorts after that migration.
-- Cabinet vendor flag on the approved vendor record.
-- Idempotent: adding the column, backfilling, and inserting Saunders Closets
-- can run more than once without overwriting an administrator's later choice.
ALTER TABLE `vendor_lines` ADD COLUMN IF NOT EXISTS `isCabinetVendor` boolean;--> statement-breakpoint

-- Pelican is the known non-cabinet vendor. sourceKey pelican wins even when a
-- PEL distributor row also matches. Only rows still unset are updated.
UPDATE `vendor_lines` vl
SET vl.`isCabinetVendor` = 0
WHERE vl.`isCabinetVendor` IS NULL
  AND LOWER(TRIM(vl.`sourceKey`)) = 'pelican';--> statement-breakpoint

-- A linked distributors row other than the Pelican line is a cabinet supplier
-- line (including legacy sourceKey ucd → USCD, dist:<id>, the distributor code,
-- and linkedDistributorIds). Pelican-only matches stay unset here and are
-- marked non-cabinet below. Hardware and other distributor-backed vendors are
-- included so their current portal keeps working; an administrator can uncheck
-- the box later.
UPDATE `vendor_lines` vl
SET vl.`isCabinetVendor` = 1
WHERE vl.`isCabinetVendor` IS NULL
  AND EXISTS (
    SELECT 1
    FROM `distributors` d
    WHERE (d.`isActive` = 1 OR d.`isActive` IS NULL)
      AND UPPER(d.`code`) <> 'PEL'
      AND (
        LOWER(TRIM(vl.`sourceKey`)) = CONCAT('dist:', d.`id`)
        OR LOWER(TRIM(vl.`sourceKey`)) = LOWER(d.`code`)
        OR (LOWER(TRIM(vl.`sourceKey`)) = 'ucd' AND LOWER(d.`code`) = 'uscd')
        OR (
          vl.`linkedDistributorIds` IS NOT NULL
          AND JSON_CONTAINS(vl.`linkedDistributorIds`, JSON_ARRAY(d.`id`))
        )
      )
  );--> statement-breakpoint

-- A vendor whose only supplier-line match is the Pelican distributor is not a
-- cabinet vendor. Vendors with no line at all stay NULL so the admin chooses.
UPDATE `vendor_lines` vl
SET vl.`isCabinetVendor` = 0
WHERE vl.`isCabinetVendor` IS NULL
  AND EXISTS (
    SELECT 1
    FROM `distributors` d
    WHERE UPPER(d.`code`) = 'PEL'
      AND (d.`isActive` = 1 OR d.`isActive` IS NULL)
      AND (
        LOWER(TRIM(vl.`sourceKey`)) = CONCAT('dist:', d.`id`)
        OR LOWER(TRIM(vl.`sourceKey`)) IN ('pel', 'pelican')
        OR LOWER(TRIM(vl.`sourceKey`)) = LOWER(d.`code`)
        OR (
          vl.`linkedDistributorIds` IS NOT NULL
          AND JSON_CONTAINS(vl.`linkedDistributorIds`, JSON_ARRAY(d.`id`))
        )
      )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM `distributors` d
    WHERE (d.`isActive` = 1 OR d.`isActive` IS NULL)
      AND UPPER(d.`code`) <> 'PEL'
      AND (
        LOWER(TRIM(vl.`sourceKey`)) = CONCAT('dist:', d.`id`)
        OR LOWER(TRIM(vl.`sourceKey`)) = LOWER(d.`code`)
        OR (LOWER(TRIM(vl.`sourceKey`)) = 'ucd' AND LOWER(d.`code`) = 'uscd')
        OR (
          vl.`linkedDistributorIds` IS NOT NULL
          AND JSON_CONTAINS(vl.`linkedDistributorIds`, JSON_ARRAY(d.`id`))
        )
      )
  );--> statement-breakpoint

-- Saunders Closets waits in Pending / Needs review. The cabinet checkbox is
-- left NULL on purpose. Contact fields stay blank.
INSERT INTO `vendor_lines` (
  `name`,
  `sourceKey`,
  `category`,
  `contactName`,
  `contactEmail`,
  `contactPhone`,
  `isApproved`,
  `isCabinetVendor`,
  `totalSalesCents`
)
SELECT
  'Saunders Closets',
  'saunders-closets',
  '',
  '',
  '',
  '',
  0,
  NULL,
  0
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1
  FROM `vendor_lines` existing
  WHERE existing.`name` = 'Saunders Closets'
     OR existing.`sourceKey` = 'saunders-closets'
);
