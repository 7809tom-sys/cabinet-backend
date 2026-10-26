-- Eligible for 3D Designer. Nullable on purpose so this file can run more than
-- once: the backfill only fills rows that are still NULL, then the column is
-- locked to NOT NULL DEFAULT false. A later admin Yes/No is not overwritten.
ALTER TABLE `cabinets` ADD COLUMN IF NOT EXISTS `designerEligible` boolean NULL;--> statement-breakpoint
-- Backfill true only when BOTH are true:
-- 1. A published, available supplier row has listPrice > 0 or yourCost > 0.
--    Draft or zero prices do not count. That is the same price the Designer
--    already requires before it will offer a cabinet.
-- 2. The Designer can render or place the cabinet. It builds a 3D box from
--    width, height, and depth (all required). Ordinary base, wall, and tall
--    boxes qualify. Accessories qualify only when they can be dropped on the
--    plan (fillers, floating shelves, wall open shelves, panels/skins other
--    than TEP3096, appliance garages, knee drawers). Crown, light rail, toe
--    kick, hardware, roll-out trays, sample doors, touch-up, and separately
--    sold glass doors stay false. Rows marked isNotCabinet stay false.
-- Items this does not decide, left false or untouched:
-- - Pelican flooring, counters, sinks, and other non-cabinet products. They
--   are not rows in `cabinets`.
-- - Cabinets with a price only on an unpublished or unavailable supplier row.
-- - Cabinets missing width, height, or depth.
-- - Cabinets whose description is written like trim. The Designer already
--   files those into Accessories using the same text, so they are not placed
--   as boxes. An admin can turn the flag on if one of those is a real cabinet.
UPDATE `cabinets` c
SET c.`designerEligible` = (
  COALESCE(c.`isNotCabinet`, 0) = 0
  AND COALESCE(c.`width`, 0) > 0
  AND COALESCE(c.`height`, 0) > 0
  AND COALESCE(c.`depth`, 0) > 0
  AND EXISTS (
    SELECT 1
    FROM `distributor_skus` s
    WHERE s.`cabinetId` = c.`id`
      AND s.`isAvailable` = 1
      AND s.`isPublished` = 1
      AND (COALESCE(s.`listPrice`, 0) > 0 OR COALESCE(s.`yourCost`, 0) > 0)
  )
  AND (
    NOT (
      LOWER(COALESCE(c.`placementType`, '')) LIKE '%accessory%'
      OR LOWER(COALESCE(c.`placementType`, '')) LIKE '%trim%'
      OR LOWER(COALESCE(c.`category`, '')) = 'accessory'
      OR LOWER(COALESCE(c.`category`, '')) LIKE '%trim%'
      OR LOWER(COALESCE(c.`category`, '')) LIKE '%molding%'
      OR LOWER(COALESCE(c.`category`, '')) LIKE '%filler%'
      OR LOWER(COALESCE(c.`category`, '')) LIKE '%panel%'
      OR LOWER(COALESCE(c.`category`, '')) = 'misc'
      OR LOWER(COALESCE(c.`subCategory`, '')) LIKE '%moulding%'
      OR LOWER(COALESCE(c.`subCategory`, '')) LIKE '%molding%'
      OR LOWER(COALESCE(c.`subCategory`, '')) LIKE '%crown%'
      OR LOWER(COALESCE(c.`subCategory`, '')) LIKE '%filler%'
      OR LOWER(COALESCE(c.`subCategory`, '')) LIKE '%panel%'
      OR LOWER(COALESCE(c.`subCategory`, '')) LIKE '%leg%'
      OR LOWER(COALESCE(c.`subCategory`, '')) LIKE '%scribe%'
      OR LOWER(COALESCE(c.`subCategory`, '')) LIKE '%rail%'
      OR LOWER(COALESCE(c.`subCategory`, '')) LIKE '%rope%'
      OR LOWER(COALESCE(c.`subCategory`, '')) LIKE '%cove%'
      OR LOWER(COALESCE(c.`subCategory`, '')) LIKE '%skin%'
      OR LOWER(COALESCE(c.`masterCode`, '')) LIKE 'pgwdc%'
      OR LOWER(COALESCE(c.`description`, '')) REGEXP 'glass door.*(fits|for)[[:space:]]+(only[[:space:]]+)?wdc|glass door sold separately'
      OR LOWER(COALESCE(c.`description`, '')) REGEXP '(^|[^a-z])(molding|moulding|scribe|light rail|crown|cove|rope|filler|end panel|skin panel|decorative leg|decorative panel|island panel|bead board|fluted filler|base filler|angle molding|inside corner molding|refrigerator end panel|shoe moulding|shoe molding|flat base molding|square decorative leg|outside corner molding|touch-?up|sample door|spray paint)([^a-z]|$)'
    )
    OR (
      UPPER(REGEXP_REPLACE(COALESCE(c.`masterCode`, ''), '[^A-Za-z0-9]', '')) <> 'TEP3096'
      AND (
        LOWER(CONCAT_WS(' ', COALESCE(c.`subCategory`, ''), COALESCE(c.`description`, ''), COALESCE(c.`masterCode`, ''))) REGEXP '(^|[^a-z])f(ill)?[-_]?[0-9]|(^|[^a-z])filler([^a-z]|$)'
        OR UPPER(TRIM(COALESCE(c.`masterCode`, ''))) REGEXP '^FS[-_ ]?[0-9]+(\\.[0-9]+)?$'
        OR LOWER(CONCAT_WS(' ', COALESCE(c.`subCategory`, ''), COALESCE(c.`description`, ''))) REGEXP '(^|[^a-z])floating[[:space:]]+shelf([^a-z]|$)'
        OR (
          LOWER(CONCAT_WS(' ', COALESCE(c.`subCategory`, ''), COALESCE(c.`description`, ''))) REGEXP '(^|[^a-z])open[[:space:]]+shelf([^a-z]|$)'
          AND UPPER(REGEXP_REPLACE(COALESCE(c.`masterCode`, ''), '[^A-Za-z0-9]', '')) NOT REGEXP '^W(E)?OS[0-9]{4}$'
          AND NOT (
            UPPER(REGEXP_REPLACE(COALESCE(c.`masterCode`, ''), '[^A-Za-z0-9]', '')) REGEXP '^OE6(30|36|42)$'
            AND LOWER(CONCAT_WS(' ', COALESCE(c.`subCategory`, ''), COALESCE(c.`description`, ''))) REGEXP '(^|[^a-z])open[[:space:]]+(end[[:space:]]+)?shelf([^a-z]|$)'
          )
          AND LOWER(CONCAT_WS(' ', COALESCE(c.`subCategory`, ''), COALESCE(c.`description`, ''))) NOT REGEXP 'wall[[:space:]]+(end[[:space:]]+)?open[[:space:]]+shelf|wall[[:space:]]+end[[:space:]]+shelf|open[[:space:]]+end[[:space:]]+shelf[[:space:]]+wall'
        )
        OR UPPER(REGEXP_REPLACE(COALESCE(c.`masterCode`, ''), '[^A-Za-z0-9]', '')) REGEXP '^W(E)?OS[0-9]{4}$'
        OR (
          UPPER(REGEXP_REPLACE(COALESCE(c.`masterCode`, ''), '[^A-Za-z0-9]', '')) REGEXP '^OE6(30|36|42)$'
          AND LOWER(CONCAT_WS(' ', COALESCE(c.`subCategory`, ''), COALESCE(c.`description`, ''))) REGEXP '(^|[^a-z])open[[:space:]]+(end[[:space:]]+)?shelf([^a-z]|$)'
        )
        OR LOWER(CONCAT_WS(' ', COALESCE(c.`subCategory`, ''), COALESCE(c.`description`, ''))) REGEXP 'wall[[:space:]]+(end[[:space:]]+)?open[[:space:]]+shelf|wall[[:space:]]+end[[:space:]]+shelf|open[[:space:]]+end[[:space:]]+shelf[[:space:]]+wall'
        OR (
          LOWER(CONCAT_WS(' ', COALESCE(c.`subCategory`, ''), COALESCE(c.`description`, ''), COALESCE(c.`masterCode`, ''))) NOT REGEXP 'crown|light rail|(^|[^a-z])toe[[:space:]]?kick([^a-z]|$)|(^|[^a-z])scribe([^a-z]|$)|(^|[^a-z])batten([^a-z]|$)|(^|[^a-z])filler([^a-z]|$)|roll[- ]?out|pull[- ]?out tray|(^|[^a-z])hinge([^a-z]|$)|(^|[^a-z])knob([^a-z]|$)|(^|[^a-z])pull([^a-z]|$)|(^|[^a-z])hardware([^a-z]|$)|molding|moulding|(^|[^a-z])trim([^a-z]|$)'
          AND (
            LOWER(CONCAT_WS(' ', COALESCE(c.`subCategory`, ''), COALESCE(c.`description`, ''), COALESCE(c.`masterCode`, ''))) REGEXP '(^|[^a-z])panel([^a-z]|$)|(^|[^a-z])skin([^a-z]|$)|end panel|dishwasher panel|refrigerator panel|decorative panel'
            OR LOWER(CONCAT_WS(' ', COALESCE(c.`subCategory`, ''), COALESCE(c.`description`, ''), COALESCE(c.`masterCode`, ''))) REGEXP 'appliance garage|(^|[^a-z])ag-?[0-9]'
            OR LOWER(CONCAT_WS(' ', COALESCE(c.`category`, ''), COALESCE(c.`subCategory`, ''), COALESCE(c.`description`, ''))) REGEXP '(^|[^a-z])knee[[:space:]]*drawer([^a-z]|$)|(^|[^a-z])knee([^a-z]|$)'
            OR UPPER(REGEXP_REPLACE(COALESCE(c.`masterCode`, ''), '[^A-Za-z0-9]', '')) REGEXP '^(VKD|DKD|KD)[0-9]'
          )
        )
      )
    )
  )
)
WHERE c.`designerEligible` IS NULL;--> statement-breakpoint
ALTER TABLE `cabinets` MODIFY `designerEligible` boolean NOT NULL DEFAULT false;
