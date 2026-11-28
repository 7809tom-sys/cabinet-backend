-- 0295. Backfill Countertop Quotes for orders that already contain a countertop.
--
-- Run after 0294_countertop_quote_order_plans.tidb.sql (the quote columns and
-- the orderRequestId index must exist). Safe to re-run: the NOT EXISTS guard
-- skips orders that already have a quote.
--
-- This is the SQL fallback. scripts/backfill-countertop-quotes.ts builds the
-- countertop plan per line; this script stores the ordered line array under
-- countertopPlan.lines, which is enough for the queue and the admin card.

-- ── 1. How many orders will be backfilled ───────────────────────────────────
SELECT COUNT(*) AS orders_to_backfill
FROM `cabinet_dealz`.`order_requests` o
WHERE o.status = 'submitted'
  AND (
    JSON_SEARCH(LOWER(CAST(o.lineItems AS CHAR)), 'one', '%countertop%') IS NOT NULL
    OR JSON_SEARCH(LOWER(CAST(o.lineItems AS CHAR)), 'one', '%quartz%') IS NOT NULL
    OR JSON_SEARCH(LOWER(CAST(o.lineItems AS CHAR)), 'one', '%granite%') IS NOT NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM `cabinet_dealz`.`countertop_quotes` q WHERE q.orderRequestId = o.id
  );

-- ── 2. Create the quotes with both plans attached ───────────────────────────
INSERT INTO `cabinet_dealz`.`countertop_quotes`
  (userId, affiliateId, contactName, contactEmail, contactPhone, zip,
   material, squareFeet, linearFeet, hasIsland,
   roomData, placedCabinets, notes,
   orderRequestId, kitchenDesignId, sourceType, countertopPlan, designerPlan,
   status, createdAt, updatedAt)
SELECT
  o.userId,
  o.affiliateId,
  o.originatorName,
  NULLIF(TRIM(o.originatorEmail), ''),
  o.originatorPhone,
  o.zip,
  NULL, 0, 0, 0,
  d.roomData,
  d.placedCabinets,
  o.notes,
  o.id,
  o.kitchenDesignId,
  'order',
  JSON_OBJECT(
    'planId', CONCAT('order:', o.id),
    'orderRequestNumber', o.requestNumber,
    'materialSku', NULL,
    'materialName', NULL,
    'lines', o.lineItems,
    'totalSqFt', NULL,
    'linearFt', NULL,
    'cutouts', JSON_ARRAY(),
    'notes', o.notes
  ),
  CASE WHEN d.id IS NULL THEN NULL ELSE JSON_OBJECT(
    'designId', CAST(d.id AS CHAR),
    'designName', d.name,
    'layoutType', d.roomType,
    'roomDimensionsIn', d.roomData,
    'sceneSnapshot', JSON_OBJECT(
      'roomData', d.roomData,
      'placedCabinets', IFNULL(d.placedCabinets, JSON_ARRAY()),
      'selectedSurfaces', IFNULL(d.selectedSurfaces, JSON_ARRAY()),
      'styleId', d.selectedStyleId
    ),
    'updatedAt', DATE_FORMAT(d.updatedAt, '%Y-%m-%dT%H:%i:%s.000Z')
  ) END,
  'new', NOW(), NOW()
FROM `cabinet_dealz`.`order_requests` o
LEFT JOIN `cabinet_dealz`.`kitchen_designs` d ON d.id = o.kitchenDesignId
WHERE o.status = 'submitted'
  AND (
    JSON_SEARCH(LOWER(CAST(o.lineItems AS CHAR)), 'one', '%countertop%') IS NOT NULL
    OR JSON_SEARCH(LOWER(CAST(o.lineItems AS CHAR)), 'one', '%quartz%') IS NOT NULL
    OR JSON_SEARCH(LOWER(CAST(o.lineItems AS CHAR)), 'one', '%granite%') IS NOT NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM `cabinet_dealz`.`countertop_quotes` q WHERE q.orderRequestId = o.id
  );

-- ── 3. Verify ───────────────────────────────────────────────────────────────
SELECT id, orderRequestId, kitchenDesignId, contactEmail, sourceType,
       JSON_UNQUOTE(JSON_EXTRACT(countertopPlan, '$.orderRequestNumber')) AS order_number,
       JSON_LENGTH(JSON_EXTRACT(countertopPlan, '$.lines')) AS line_count,
       designerPlan IS NOT NULL AS has_designer_plan
FROM `cabinet_dealz`.`countertop_quotes`
WHERE sourceType = 'order'
ORDER BY id DESC
LIMIT 20;
