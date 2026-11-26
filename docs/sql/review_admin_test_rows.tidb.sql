-- Review only. NOT RUN against production by this pull request.
--
-- Database: TiDB Cloud, schema cabinet_dealz.
-- The cluster prefix recorded in docs/sql/order-verified-columns-create.sql is 4GBFngYGckRNTBc.
-- In the TiDB Cloud SQL editor, select cabinet_dealz and paste ONE statement at a time.
--
-- Part 0 and Part 1 are reads. Those are the statements to run now.
-- Part 2 deletes, then ROLLBACK. The TiDB Cloud SQL editor commits each statement
-- by itself, so do not paste Part 2 there. In a mysql client that honors
-- START TRANSACTION, Part 2 prints the same preview rows and then puts every
-- row back. Change the final ROLLBACK to COMMIT only after Part 1 looks right.
-- If any Part 2 statement errors, run ROLLBACK immediately and stop.
--
-- A row is deleted only when it is clearly test data:
--   * Email domain is one the CRM cleanup planner already treats as fake
--     (server/crmCleanup/plan.ts): example.com, example.org, example.net,
--     example.invalid, test.com, mailinator.com, guerrillamail.com, yopmail.com,
--     tempmail.com, trashmail.com, 10minutemail.com, sharklasers.com,
--     discard.email, fakeinbox.com, mailnull.com. This file also treats
--     example.edu and cabinetdealz.test as test, and any address ending in
--     .test, .invalid, .example, or .localhost.
--   * Countertop quote note is exactly "vitest countertop request".
--     server/design.countertop.test.ts writes buyer@example.com, 32.5 sq ft,
--     18 lin ft, island, ZIP 75201, and never deletes the row. That is the
--     Oct 20 Countertop Quotes screenshot.
--   * Order request number starts with VF-TEST-, E2E-CRM-, or DELETE-,
--     or is TEST-CUSTOMER-1 or TEST-CONTRACTOR-1, or stripePaymentIntentId
--     starts with pi_synthetic_.
--
-- Not deleted:
--   * users, affiliates, kitchen_designs, fabrication_shops, catalog,
--     vendor inventory, sales-forecast settings.
--   * Cabinet-shop prospect CRM rows (notes containing cabinet_shop_list_).
--     Those come from cabinet-frontend docs/sql/0290 and are real shops.
--   * Any real-domain customer, including @cabinetdealz.com and @gmail.com.
--   * A test-looking order that a non-test CRM deal still points at, or that
--     a live Stripe charge (livemode = 1, stripeMode = live, customer email
--     not a test domain) still points at.
--   * A test-looking CRM deal with a sales commission already marked paid.
--   * Live-mode Stripe rows, even with a test email. Part 1 lists them.
--   * A payment whose order is being kept, even if payerEmail is a test domain.
--   * A person whose name merely contains "test" or "sample". CRM Cleanup
--     flags those names. This file does not delete them.
--
-- Do not run Admin -> Customers -> purge test members. That deletes every
-- user who is not an admin. Do not run server/cleanup_test_data.mjs. That
-- deletes users whose loginMethod is null.
--
-- Each Part 2 delete is preceded by the SELECT of the same rows.
-- The same SELECT is repeated in Part 1 so it can be pasted alone.
--
-- Optional statements after ROLLBACK use tables that may not exist yet
-- (countertop_quote_fab_shops until docs/sql/0291, designer_helper_requests
-- until cabinet-frontend docs/sql/0257). If the SELECT says the table does
-- not exist, skip that pair. Do not paste those deletes into the SQL editor.

-- ---------------------------------------------------------------------------
-- Part 0. Which hand-run files already landed. Read-only. Paste this one.
-- present = 1 means that table or column is already there.
-- present = 0 means that file has not been applied.
-- ---------------------------------------------------------------------------

SELECT item, present FROM (
  SELECT '0246 order_requests.orderVerifiedEmailSentAt' AS item,
    (SELECT COUNT(*) FROM information_schema.columns
      WHERE table_schema = 'cabinet_dealz' AND table_name = 'order_requests' AND column_name = 'orderVerifiedEmailSentAt') AS present
  UNION ALL SELECT '0247 order_requests.palletPhotoUrl',
    (SELECT COUNT(*) FROM information_schema.columns
      WHERE table_schema = 'cabinet_dealz' AND table_name = 'order_requests' AND column_name = 'palletPhotoUrl')
  UNION ALL SELECT '0254 kitchen_rule_settings',
    (SELECT COUNT(*) FROM information_schema.tables
      WHERE table_schema = 'cabinet_dealz' AND table_name = 'kitchen_rule_settings')
  UNION ALL SELECT '0255 affiliate_literature.visibility',
    (SELECT COUNT(*) FROM information_schema.columns
      WHERE table_schema = 'cabinet_dealz' AND table_name = 'affiliate_literature' AND column_name = 'visibility')
  UNION ALL SELECT '0271 affiliate_storefront_claims',
    (SELECT COUNT(*) FROM information_schema.tables
      WHERE table_schema = 'cabinet_dealz' AND table_name = 'affiliate_storefront_claims')
  UNION ALL SELECT '0272 affiliate_legal_documents',
    (SELECT COUNT(*) FROM information_schema.tables
      WHERE table_schema = 'cabinet_dealz' AND table_name = 'affiliate_legal_documents')
  UNION ALL SELECT '0280 door_styles.doorColorSource',
    (SELECT COUNT(*) FROM information_schema.columns
      WHERE table_schema = 'cabinet_dealz' AND table_name = 'door_styles' AND column_name = 'doorColorSource')
  UNION ALL SELECT '0281 hardware_category_affiliate_markups',
    (SELECT COUNT(*) FROM information_schema.tables
      WHERE table_schema = 'cabinet_dealz' AND table_name = 'hardware_category_affiliate_markups')
  UNION ALL SELECT '0284 crm_deals.firstDesignSavedAt',
    (SELECT COUNT(*) FROM information_schema.columns
      WHERE table_schema = 'cabinet_dealz' AND table_name = 'crm_deals' AND column_name = 'firstDesignSavedAt')
  UNION ALL SELECT '0285 backup_runs',
    (SELECT COUNT(*) FROM information_schema.tables
      WHERE table_schema = 'cabinet_dealz' AND table_name = 'backup_runs')
  UNION ALL SELECT '0286 outreach_settings',
    (SELECT COUNT(*) FROM information_schema.tables
      WHERE table_schema = 'cabinet_dealz' AND table_name = 'outreach_settings')
  UNION ALL SELECT '0287 warehouses',
    (SELECT COUNT(*) FROM information_schema.tables
      WHERE table_schema = 'cabinet_dealz' AND table_name = 'warehouses')
  UNION ALL SELECT '0288 designer_subscriptions',
    (SELECT COUNT(*) FROM information_schema.tables
      WHERE table_schema = 'cabinet_dealz' AND table_name = 'designer_subscriptions')
  UNION ALL SELECT '0291 fabrication_shops',
    (SELECT COUNT(*) FROM information_schema.tables
      WHERE table_schema = 'cabinet_dealz' AND table_name = 'fabrication_shops')
  UNION ALL SELECT 'frontend 0257 designer_helper_requests',
    (SELECT COUNT(*) FROM information_schema.tables
      WHERE table_schema = 'cabinet_dealz' AND table_name = 'designer_helper_requests')
) AS checks
ORDER BY item;

-- ---------------------------------------------------------------------------
-- Part 1. Read-only previews. Safe to paste one statement at a time.
-- The label (P1, P2, ...) matches the delete with the same number in Part 2.
-- ---------------------------------------------------------------------------
-- P1. Countertop Quotes. Screenshot fingerprint: buyer@example.com, 32.5 sq ft, 18 lin ft, ZIP 75201. These rows are included in D1.
SELECT id, contactEmail, contactName, status, zip, squareFeet, linearFeet, hasIsland, notes, createdAt
FROM cabinet_dealz.countertop_quotes AS quote
WHERE contactEmail = 'buyer@example.com'
  AND squareFeet = 32.50
  AND linearFeet = 18.00
  AND zip = '75201'
ORDER BY id;

-- P2. D1 preview. Countertop quote rows the delete will remove.
SELECT quote.id, quote.contactEmail, quote.contactName, quote.status, quote.zip, quote.squareFeet, quote.linearFeet, quote.notes, quote.createdAt
FROM cabinet_dealz.countertop_quotes AS quote
WHERE (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(quote.contactEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(quote.contactEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(quote.contactEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(quote.contactEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(quote.contactEmail,''))) LIKE '%.localhost'
  )
  OR quote.notes = 'vitest countertop request'
ORDER BY quote.id;

-- P3. Countertop quotes this file will keep. Do not delete these.
SELECT quote.id, quote.contactEmail, quote.contactName, quote.status, quote.zip, quote.squareFeet, quote.createdAt
FROM cabinet_dealz.countertop_quotes AS quote
WHERE NOT ((
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(quote.contactEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(quote.contactEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(quote.contactEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(quote.contactEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(quote.contactEmail,''))) LIKE '%.localhost'
  )
  OR quote.notes = 'vitest countertop request')
ORDER BY quote.id DESC
LIMIT 25;

-- P4. D2 preview. Payments on orders D4 will remove. Incoming Orders, Master Orders, and Sample Orders all read order_requests. orderKind = 'sample' is the Sample Orders tab.
SELECT pay.id, pay.orderRequestId, pay.requestNumber, pay.payerEmail, pay.environment, pay.status, pay.amountCents, o.orderKind, o.originatorEmail, o.requestNumber AS orderNumber
FROM cabinet_dealz.payments AS pay
INNER JOIN cabinet_dealz.order_requests AS o ON o.id = pay.orderRequestId
WHERE (
    (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(o.originatorEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.localhost'
  )
    OR o.requestNumber LIKE 'VF-TEST-%'
    OR o.requestNumber LIKE 'E2E-CRM-%'
    OR o.requestNumber IN ('TEST-CUSTOMER-1','TEST-CONTRACTOR-1')
    OR o.requestNumber LIKE 'DELETE-%'
    OR IFNULL(o.stripePaymentIntentId,'') LIKE 'pi_synthetic_%'
  )
  AND NOT EXISTS (
      SELECT 1 FROM cabinet_dealz.crm_deals AS d
      WHERE d.orderRequestId = o.id
        AND d.contactEmail IS NOT NULL
        AND NOT (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(d.contactEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.localhost'
  )
    )
  AND NOT EXISTS (
      SELECT 1 FROM cabinet_dealz.stripe_payment_records AS s
      WHERE s.orderRequestId = o.id
        AND s.livemode = 1
        AND s.stripeMode = 'live'
        AND (s.customerEmail IS NULL OR NOT (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(s.customerEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.localhost'
  ))
    )
ORDER BY pay.id;

-- P5. D3 preview. Shipments on those same orders.
SELECT ship.id, ship.orderRequestId, o.requestNumber, o.originatorEmail, o.orderKind
FROM cabinet_dealz.order_shipments AS ship
INNER JOIN cabinet_dealz.order_requests AS o ON o.id = ship.orderRequestId
WHERE (
    (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(o.originatorEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.localhost'
  )
    OR o.requestNumber LIKE 'VF-TEST-%'
    OR o.requestNumber LIKE 'E2E-CRM-%'
    OR o.requestNumber IN ('TEST-CUSTOMER-1','TEST-CONTRACTOR-1')
    OR o.requestNumber LIKE 'DELETE-%'
    OR IFNULL(o.stripePaymentIntentId,'') LIKE 'pi_synthetic_%'
  )
  AND NOT EXISTS (
      SELECT 1 FROM cabinet_dealz.crm_deals AS d
      WHERE d.orderRequestId = o.id
        AND d.contactEmail IS NOT NULL
        AND NOT (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(d.contactEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.localhost'
  )
    )
  AND NOT EXISTS (
      SELECT 1 FROM cabinet_dealz.stripe_payment_records AS s
      WHERE s.orderRequestId = o.id
        AND s.livemode = 1
        AND s.stripeMode = 'live'
        AND (s.customerEmail IS NULL OR NOT (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(s.customerEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.localhost'
  ))
    )
ORDER BY ship.id;

-- P6. D4 preview. Line-cost rows on those orders.
SELECT cost.id, cost.orderRequestId, o.requestNumber, o.originatorEmail, o.orderKind
FROM cabinet_dealz.order_request_line_costs AS cost
INNER JOIN cabinet_dealz.order_requests AS o ON o.id = cost.orderRequestId
WHERE (
    (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(o.originatorEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.localhost'
  )
    OR o.requestNumber LIKE 'VF-TEST-%'
    OR o.requestNumber LIKE 'E2E-CRM-%'
    OR o.requestNumber IN ('TEST-CUSTOMER-1','TEST-CONTRACTOR-1')
    OR o.requestNumber LIKE 'DELETE-%'
    OR IFNULL(o.stripePaymentIntentId,'') LIKE 'pi_synthetic_%'
  )
  AND NOT EXISTS (
      SELECT 1 FROM cabinet_dealz.crm_deals AS d
      WHERE d.orderRequestId = o.id
        AND d.contactEmail IS NOT NULL
        AND NOT (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(d.contactEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.localhost'
  )
    )
  AND NOT EXISTS (
      SELECT 1 FROM cabinet_dealz.stripe_payment_records AS s
      WHERE s.orderRequestId = o.id
        AND s.livemode = 1
        AND s.stripeMode = 'live'
        AND (s.customerEmail IS NULL OR NOT (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(s.customerEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.localhost'
  ))
    )
ORDER BY cost.id;

-- P7. D5 preview. Commerce snapshots on those orders.
SELECT snap.id, snap.orderRequestId, o.requestNumber, o.originatorEmail, o.orderKind
FROM cabinet_dealz.order_request_commerce_snapshots AS snap
INNER JOIN cabinet_dealz.order_requests AS o ON o.id = snap.orderRequestId
WHERE (
    (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(o.originatorEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.localhost'
  )
    OR o.requestNumber LIKE 'VF-TEST-%'
    OR o.requestNumber LIKE 'E2E-CRM-%'
    OR o.requestNumber IN ('TEST-CUSTOMER-1','TEST-CONTRACTOR-1')
    OR o.requestNumber LIKE 'DELETE-%'
    OR IFNULL(o.stripePaymentIntentId,'') LIKE 'pi_synthetic_%'
  )
  AND NOT EXISTS (
      SELECT 1 FROM cabinet_dealz.crm_deals AS d
      WHERE d.orderRequestId = o.id
        AND d.contactEmail IS NOT NULL
        AND NOT (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(d.contactEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.localhost'
  )
    )
  AND NOT EXISTS (
      SELECT 1 FROM cabinet_dealz.stripe_payment_records AS s
      WHERE s.orderRequestId = o.id
        AND s.livemode = 1
        AND s.stripeMode = 'live'
        AND (s.customerEmail IS NULL OR NOT (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(s.customerEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.localhost'
  ))
    )
ORDER BY snap.id;

-- P8. D6 preview. The order_requests rows themselves (Incoming, Master, and Sample).
SELECT o.id, o.requestNumber, o.orderKind, o.originatorEmail, o.originatorName, o.status, o.stripePaymentIntentId, o.createdAt
FROM cabinet_dealz.order_requests AS o
WHERE (
    (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(o.originatorEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.localhost'
  )
    OR o.requestNumber LIKE 'VF-TEST-%'
    OR o.requestNumber LIKE 'E2E-CRM-%'
    OR o.requestNumber IN ('TEST-CUSTOMER-1','TEST-CONTRACTOR-1')
    OR o.requestNumber LIKE 'DELETE-%'
    OR IFNULL(o.stripePaymentIntentId,'') LIKE 'pi_synthetic_%'
  )
  AND NOT EXISTS (
      SELECT 1 FROM cabinet_dealz.crm_deals AS d
      WHERE d.orderRequestId = o.id
        AND d.contactEmail IS NOT NULL
        AND NOT (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(d.contactEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.localhost'
  )
    )
  AND NOT EXISTS (
      SELECT 1 FROM cabinet_dealz.stripe_payment_records AS s
      WHERE s.orderRequestId = o.id
        AND s.livemode = 1
        AND s.stripeMode = 'live'
        AND (s.customerEmail IS NULL OR NOT (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(s.customerEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.localhost'
  ))
    )
ORDER BY o.id;

-- P9. Orders that look like tests but are held. Part 2 does not delete these.
SELECT o.id, o.requestNumber, o.orderKind, o.originatorEmail, o.originatorName, o.status, o.createdAt
FROM cabinet_dealz.order_requests AS o
WHERE (
    (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(o.originatorEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.localhost'
  )
    OR o.requestNumber LIKE 'VF-TEST-%'
    OR o.requestNumber LIKE 'E2E-CRM-%'
    OR o.requestNumber IN ('TEST-CUSTOMER-1','TEST-CONTRACTOR-1')
    OR o.requestNumber LIKE 'DELETE-%'
    OR IFNULL(o.stripePaymentIntentId,'') LIKE 'pi_synthetic_%'
  )
  AND (
    EXISTS (
      SELECT 1 FROM cabinet_dealz.crm_deals AS d
      WHERE d.orderRequestId = o.id
        AND d.contactEmail IS NOT NULL
        AND NOT (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(d.contactEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.localhost'
  )
    )
    OR EXISTS (
      SELECT 1 FROM cabinet_dealz.stripe_payment_records AS s
      WHERE s.orderRequestId = o.id
        AND s.livemode = 1
        AND s.stripeMode = 'live'
        AND (s.customerEmail IS NULL OR NOT (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(s.customerEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.localhost'
  ))
    )
  )
ORDER BY o.id
LIMIT 50;

-- P10. D7 preview. CRM activities on deals D11 will remove. Sales CRM reads crm_deals.
SELECT activity.id, activity.dealId, deal.contactEmail, deal.contactName, deal.title
FROM cabinet_dealz.crm_activities AS activity
INNER JOIN cabinet_dealz.crm_deals AS deal ON deal.id = activity.dealId
WHERE (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(deal.contactEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.localhost'
  )
  AND NOT EXISTS (
    SELECT 1 FROM cabinet_dealz.sales_commissions AS commission
    WHERE commission.dealId = deal.id AND commission.status = 'paid'
  )
ORDER BY activity.id;

-- P11. D8 preview. Design links on those deals.
SELECT link.id, link.dealId, deal.contactEmail, deal.title
FROM cabinet_dealz.crm_deal_designs AS link
INNER JOIN cabinet_dealz.crm_deals AS deal ON deal.id = link.dealId
WHERE (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(deal.contactEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.localhost'
  )
  AND NOT EXISTS (
    SELECT 1 FROM cabinet_dealz.sales_commissions AS commission
    WHERE commission.dealId = deal.id AND commission.status = 'paid'
  )
ORDER BY link.id;

-- P12. D9 preview. CRM email log rows on those deals.
SELECT mail.id, mail.dealId, mail.toEmail, deal.contactEmail, deal.title
FROM cabinet_dealz.crm_email_log AS mail
INNER JOIN cabinet_dealz.crm_deals AS deal ON deal.id = mail.dealId
WHERE (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(deal.contactEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.localhost'
  )
  AND NOT EXISTS (
    SELECT 1 FROM cabinet_dealz.sales_commissions AS commission
    WHERE commission.dealId = deal.id AND commission.status = 'paid'
  )
ORDER BY mail.id;

-- P13. D10 preview. Files on those deals.
SELECT file.id, file.dealId, file.fileName, deal.contactEmail, deal.title
FROM cabinet_dealz.crm_deal_files AS file
INNER JOIN cabinet_dealz.crm_deals AS deal ON deal.id = file.dealId
WHERE (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(deal.contactEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.localhost'
  )
  AND NOT EXISTS (
    SELECT 1 FROM cabinet_dealz.sales_commissions AS commission
    WHERE commission.dealId = deal.id AND commission.status = 'paid'
  )
ORDER BY file.id;

-- P14. D11 preview. Unpaid or void commissions on those deals. A commission marked paid keeps the deal.
SELECT commission.id, commission.dealId, commission.status, commission.amountCents, deal.contactEmail, deal.title
FROM cabinet_dealz.sales_commissions AS commission
INNER JOIN cabinet_dealz.crm_deals AS deal ON deal.id = commission.dealId
WHERE (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(deal.contactEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.localhost'
  )
  AND NOT EXISTS (
    SELECT 1 FROM cabinet_dealz.sales_commissions AS commission
    WHERE commission.dealId = deal.id AND commission.status = 'paid'
  )
  AND commission.status <> 'paid'
ORDER BY commission.id;

-- P15. D12 preview. CRM deals with a test email and no paid commission.
SELECT deal.id, deal.title, deal.contactEmail, deal.contactName, deal.company, deal.stage, deal.source, deal.createdAt
FROM cabinet_dealz.crm_deals AS deal
WHERE (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(deal.contactEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.localhost'
  )
  AND NOT EXISTS (
    SELECT 1 FROM cabinet_dealz.sales_commissions AS commission
    WHERE commission.dealId = deal.id AND commission.status = 'paid'
  )
ORDER BY deal.id;

-- P16. Test-looking CRM deals kept because a commission is marked paid.
SELECT deal.id, deal.title, deal.contactEmail, deal.stage, commission.status, commission.amountCents
FROM cabinet_dealz.crm_deals AS deal
INNER JOIN cabinet_dealz.sales_commissions AS commission ON commission.dealId = deal.id AND commission.status = 'paid'
WHERE (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(deal.contactEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.localhost'
  )
ORDER BY deal.id;

-- P17. D13 preview. Design Leads.
SELECT lead.id, lead.email, lead.name, lead.phone, lead.source, lead.createdAt
FROM cabinet_dealz.design_leads AS lead
WHERE (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(lead.email,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(lead.email,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(lead.email,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(lead.email,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(lead.email,''))) LIKE '%.localhost'
  )
ORDER BY lead.id;

-- P18. D14 preview. Consultations.
SELECT consult.id, consult.customerEmail, consult.customerName, consult.status, consult.startAt, consult.createdAt
FROM cabinet_dealz.design_consultations AS consult
WHERE (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(consult.customerEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(consult.customerEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(consult.customerEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(consult.customerEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(consult.customerEmail,''))) LIKE '%.localhost'
  )
ORDER BY consult.id;

-- P19. D15 preview. Stripe Invoices in test mode whose customer email is a test domain. Live mode is not in this list.
SELECT stripe.id, stripe.customerEmail, stripe.customerName, stripe.status, stripe.stripeMode, stripe.livemode, stripe.purpose, stripe.amountCents, stripe.createdAt
FROM cabinet_dealz.stripe_payment_records AS stripe
WHERE stripe.stripeMode = 'test'
  AND (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(stripe.customerEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(stripe.customerEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(stripe.customerEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(stripe.customerEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(stripe.customerEmail,''))) LIKE '%.localhost'
  )
ORDER BY stripe.id;

-- P20. Stripe rows Part 2 will not delete: live mode, or test mode with a real-looking email. Review by hand.
SELECT id, customerEmail, customerName, status, stripeMode, livemode, purpose, amountCents, createdAt
FROM cabinet_dealz.stripe_payment_records
WHERE stripeMode = 'live'
   OR livemode = 1
   OR NOT (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(customerEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(customerEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(customerEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(customerEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(customerEmail,''))) LIKE '%.localhost'
  )
ORDER BY id DESC
LIMIT 30;

-- P21. D16 preview. Pro Applications.
SELECT app.id, app.email, app.contactName, app.companyName, app.status, app.createdAt
FROM cabinet_dealz.pro_applications AS app
WHERE (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(app.email,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(app.email,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(app.email,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(app.email,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(app.email,''))) LIKE '%.localhost'
  )
ORDER BY app.id;

-- P22. D17 preview. Vendor applications (Admin -> Vendors).
SELECT app.id, app.email, app.contactName, app.companyName, app.status, app.createdAt
FROM cabinet_dealz.vendor_applications AS app
WHERE (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(app.email,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(app.email,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(app.email,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(app.email,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(app.email,''))) LIKE '%.localhost'
  )
ORDER BY app.id;

-- P23. D18 preview. Vendor referrals.
SELECT ref.id, ref.email, ref.vendorName, ref.contactName, ref.status, ref.createdAt
FROM cabinet_dealz.vendor_referrals AS ref
WHERE (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(ref.email,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(ref.email,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(ref.email,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(ref.email,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(ref.email,''))) LIKE '%.localhost'
  )
ORDER BY ref.id;

-- P24. D19 preview. Contractor access requests.
SELECT req.id, req.contractorEmail, req.contractorName, req.businessName, req.status, req.createdAt
FROM cabinet_dealz.contractor_access_requests AS req
WHERE (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(req.contractorEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(req.contractorEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(req.contractorEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(req.contractorEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(req.contractorEmail,''))) LIKE '%.localhost'
  )
ORDER BY req.id;

-- P25. D20 preview. Contractor customer folders seeded by the test login (homeowner@cabinetdealz.test). Not an admin tab, but the contractor portal reads them.
SELECT id, contractorUserId, name, email, notes, createdAt
FROM cabinet_dealz.contractor_customers
WHERE (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(email,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(email,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(email,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(email,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(email,''))) LIKE '%.localhost'
  )
ORDER BY id;

-- P26. Users with a test-domain email, or the two built-in test logins. Part 2 does not delete users. CRM Cleanup is the screen that can remove accounts, and it keeps Tom and the named staff list.
SELECT id, email, name, role, openId, loginMethod, createdAt
FROM cabinet_dealz.users
WHERE (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(email,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(email,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(email,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(email,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(email,''))) LIKE '%.localhost'
  )
   OR openId IN ('test-account-customer','test-account-contractor')
ORDER BY id
LIMIT 50;

-- P27. Saved designs the test login creates. Part 2 does not delete designs. Listed so they are not mistaken for customer plans.
SELECT id, userId, name, roomType, createdAt
FROM cabinet_dealz.kitchen_designs
WHERE name IN ('Sample customer kitchen','Sample contractor kitchen')
ORDER BY id;

-- P28. Payments with a test payer email whose order is NOT being deleted. Part 2 leaves these in place.
SELECT pay.id, pay.orderRequestId, pay.requestNumber, pay.payerEmail, pay.environment, pay.status, pay.amountCents
FROM cabinet_dealz.payments AS pay
WHERE (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(pay.payerEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(pay.payerEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(pay.payerEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(pay.payerEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(pay.payerEmail,''))) LIKE '%.localhost'
  )
  AND NOT EXISTS (
    SELECT 1 FROM cabinet_dealz.order_requests AS o
    WHERE o.id = pay.orderRequestId
      AND (
    (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(o.originatorEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.localhost'
  )
    OR o.requestNumber LIKE 'VF-TEST-%'
    OR o.requestNumber LIKE 'E2E-CRM-%'
    OR o.requestNumber IN ('TEST-CUSTOMER-1','TEST-CONTRACTOR-1')
    OR o.requestNumber LIKE 'DELETE-%'
    OR IFNULL(o.stripePaymentIntentId,'') LIKE 'pi_synthetic_%'
  )
  AND NOT EXISTS (
      SELECT 1 FROM cabinet_dealz.crm_deals AS d
      WHERE d.orderRequestId = o.id
        AND d.contactEmail IS NOT NULL
        AND NOT (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(d.contactEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.localhost'
  )
    )
  AND NOT EXISTS (
      SELECT 1 FROM cabinet_dealz.stripe_payment_records AS s
      WHERE s.orderRequestId = o.id
        AND s.livemode = 1
        AND s.stripeMode = 'live'
        AND (s.customerEmail IS NULL OR NOT (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(s.customerEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.localhost'
  ))
    )
  )
ORDER BY pay.id
LIMIT 50;

-- P29. Counts by admin area. wouldDelete is what Part 2 removes. totalRows is the whole table.
SELECT 'countertop_quotes' AS tbl,
  SUM(CASE WHEN (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(quote.contactEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(quote.contactEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(quote.contactEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(quote.contactEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(quote.contactEmail,''))) LIKE '%.localhost'
  )
  OR quote.notes = 'vitest countertop request' THEN 1 ELSE 0 END) AS wouldDelete,
  COUNT(*) AS totalRows
FROM cabinet_dealz.countertop_quotes AS quote
UNION ALL
SELECT 'order_requests',
  SUM(CASE WHEN (
    (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(o.originatorEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.localhost'
  )
    OR o.requestNumber LIKE 'VF-TEST-%'
    OR o.requestNumber LIKE 'E2E-CRM-%'
    OR o.requestNumber IN ('TEST-CUSTOMER-1','TEST-CONTRACTOR-1')
    OR o.requestNumber LIKE 'DELETE-%'
    OR IFNULL(o.stripePaymentIntentId,'') LIKE 'pi_synthetic_%'
  )
  AND NOT EXISTS (
      SELECT 1 FROM cabinet_dealz.crm_deals AS d
      WHERE d.orderRequestId = o.id
        AND d.contactEmail IS NOT NULL
        AND NOT (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(d.contactEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.localhost'
  )
    )
  AND NOT EXISTS (
      SELECT 1 FROM cabinet_dealz.stripe_payment_records AS s
      WHERE s.orderRequestId = o.id
        AND s.livemode = 1
        AND s.stripeMode = 'live'
        AND (s.customerEmail IS NULL OR NOT (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(s.customerEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.localhost'
  ))
    ) THEN 1 ELSE 0 END),
  COUNT(*)
FROM cabinet_dealz.order_requests AS o
UNION ALL
SELECT 'crm_deals',
  SUM(CASE WHEN (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(deal.contactEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.localhost'
  )
  AND NOT EXISTS (
    SELECT 1 FROM cabinet_dealz.sales_commissions AS commission
    WHERE commission.dealId = deal.id AND commission.status = 'paid'
  ) THEN 1 ELSE 0 END),
  COUNT(*)
FROM cabinet_dealz.crm_deals AS deal
UNION ALL
SELECT 'design_leads',
  SUM(CASE WHEN (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(lead.email,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(lead.email,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(lead.email,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(lead.email,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(lead.email,''))) LIKE '%.localhost'
  ) THEN 1 ELSE 0 END),
  COUNT(*)
FROM cabinet_dealz.design_leads AS lead
UNION ALL
SELECT 'design_consultations',
  SUM(CASE WHEN (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(consult.customerEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(consult.customerEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(consult.customerEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(consult.customerEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(consult.customerEmail,''))) LIKE '%.localhost'
  ) THEN 1 ELSE 0 END),
  COUNT(*)
FROM cabinet_dealz.design_consultations AS consult
UNION ALL
SELECT 'stripe_payment_records_test_mode',
  SUM(CASE WHEN stripe.stripeMode = 'test' AND (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(stripe.customerEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(stripe.customerEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(stripe.customerEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(stripe.customerEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(stripe.customerEmail,''))) LIKE '%.localhost'
  ) THEN 1 ELSE 0 END),
  COUNT(*)
FROM cabinet_dealz.stripe_payment_records AS stripe
UNION ALL
SELECT 'pro_applications',
  SUM(CASE WHEN (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(app.email,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(app.email,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(app.email,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(app.email,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(app.email,''))) LIKE '%.localhost'
  ) THEN 1 ELSE 0 END),
  COUNT(*)
FROM cabinet_dealz.pro_applications AS app
UNION ALL
SELECT 'vendor_applications',
  SUM(CASE WHEN (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(app.email,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(app.email,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(app.email,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(app.email,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(app.email,''))) LIKE '%.localhost'
  ) THEN 1 ELSE 0 END),
  COUNT(*)
FROM cabinet_dealz.vendor_applications AS app
UNION ALL
SELECT 'vendor_referrals',
  SUM(CASE WHEN (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(ref.email,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(ref.email,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(ref.email,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(ref.email,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(ref.email,''))) LIKE '%.localhost'
  ) THEN 1 ELSE 0 END),
  COUNT(*)
FROM cabinet_dealz.vendor_referrals AS ref
UNION ALL
SELECT 'contractor_access_requests',
  SUM(CASE WHEN (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(req.contractorEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(req.contractorEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(req.contractorEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(req.contractorEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(req.contractorEmail,''))) LIKE '%.localhost'
  ) THEN 1 ELSE 0 END),
  COUNT(*)
FROM cabinet_dealz.contractor_access_requests AS req;


-- ---------------------------------------------------------------------------
-- Part 2. Do not paste this into the TiDB Cloud SQL editor.
-- Each delete is preceded by the SELECT of those same rows.
-- The transaction ends in ROLLBACK.
-- ---------------------------------------------------------------------------

START TRANSACTION;
-- D1. Same rows as P2.
SELECT quote.id, quote.contactEmail, quote.contactName, quote.status, quote.zip, quote.squareFeet, quote.linearFeet, quote.notes, quote.createdAt
FROM cabinet_dealz.countertop_quotes AS quote
WHERE (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(quote.contactEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(quote.contactEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(quote.contactEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(quote.contactEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(quote.contactEmail,''))) LIKE '%.localhost'
  )
  OR quote.notes = 'vitest countertop request'
ORDER BY quote.id;

DELETE quote
FROM cabinet_dealz.countertop_quotes AS quote
WHERE (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(quote.contactEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(quote.contactEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(quote.contactEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(quote.contactEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(quote.contactEmail,''))) LIKE '%.localhost'
  )
  OR quote.notes = 'vitest countertop request';

-- D2. Same rows as P4.
SELECT pay.id, pay.orderRequestId, pay.requestNumber, pay.payerEmail, pay.environment, pay.status, pay.amountCents, o.orderKind, o.originatorEmail, o.requestNumber AS orderNumber
FROM cabinet_dealz.payments AS pay
INNER JOIN cabinet_dealz.order_requests AS o ON o.id = pay.orderRequestId
WHERE (
    (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(o.originatorEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.localhost'
  )
    OR o.requestNumber LIKE 'VF-TEST-%'
    OR o.requestNumber LIKE 'E2E-CRM-%'
    OR o.requestNumber IN ('TEST-CUSTOMER-1','TEST-CONTRACTOR-1')
    OR o.requestNumber LIKE 'DELETE-%'
    OR IFNULL(o.stripePaymentIntentId,'') LIKE 'pi_synthetic_%'
  )
  AND NOT EXISTS (
      SELECT 1 FROM cabinet_dealz.crm_deals AS d
      WHERE d.orderRequestId = o.id
        AND d.contactEmail IS NOT NULL
        AND NOT (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(d.contactEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.localhost'
  )
    )
  AND NOT EXISTS (
      SELECT 1 FROM cabinet_dealz.stripe_payment_records AS s
      WHERE s.orderRequestId = o.id
        AND s.livemode = 1
        AND s.stripeMode = 'live'
        AND (s.customerEmail IS NULL OR NOT (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(s.customerEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.localhost'
  ))
    )
ORDER BY pay.id;

DELETE pay
FROM cabinet_dealz.payments AS pay
INNER JOIN cabinet_dealz.order_requests AS o ON o.id = pay.orderRequestId
WHERE (
    (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(o.originatorEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.localhost'
  )
    OR o.requestNumber LIKE 'VF-TEST-%'
    OR o.requestNumber LIKE 'E2E-CRM-%'
    OR o.requestNumber IN ('TEST-CUSTOMER-1','TEST-CONTRACTOR-1')
    OR o.requestNumber LIKE 'DELETE-%'
    OR IFNULL(o.stripePaymentIntentId,'') LIKE 'pi_synthetic_%'
  )
  AND NOT EXISTS (
      SELECT 1 FROM cabinet_dealz.crm_deals AS d
      WHERE d.orderRequestId = o.id
        AND d.contactEmail IS NOT NULL
        AND NOT (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(d.contactEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.localhost'
  )
    )
  AND NOT EXISTS (
      SELECT 1 FROM cabinet_dealz.stripe_payment_records AS s
      WHERE s.orderRequestId = o.id
        AND s.livemode = 1
        AND s.stripeMode = 'live'
        AND (s.customerEmail IS NULL OR NOT (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(s.customerEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.localhost'
  ))
    );

-- D3. Same rows as P5.
SELECT ship.id, ship.orderRequestId, o.requestNumber, o.originatorEmail, o.orderKind
FROM cabinet_dealz.order_shipments AS ship
INNER JOIN cabinet_dealz.order_requests AS o ON o.id = ship.orderRequestId
WHERE (
    (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(o.originatorEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.localhost'
  )
    OR o.requestNumber LIKE 'VF-TEST-%'
    OR o.requestNumber LIKE 'E2E-CRM-%'
    OR o.requestNumber IN ('TEST-CUSTOMER-1','TEST-CONTRACTOR-1')
    OR o.requestNumber LIKE 'DELETE-%'
    OR IFNULL(o.stripePaymentIntentId,'') LIKE 'pi_synthetic_%'
  )
  AND NOT EXISTS (
      SELECT 1 FROM cabinet_dealz.crm_deals AS d
      WHERE d.orderRequestId = o.id
        AND d.contactEmail IS NOT NULL
        AND NOT (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(d.contactEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.localhost'
  )
    )
  AND NOT EXISTS (
      SELECT 1 FROM cabinet_dealz.stripe_payment_records AS s
      WHERE s.orderRequestId = o.id
        AND s.livemode = 1
        AND s.stripeMode = 'live'
        AND (s.customerEmail IS NULL OR NOT (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(s.customerEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.localhost'
  ))
    )
ORDER BY ship.id;

DELETE ship
FROM cabinet_dealz.order_shipments AS ship
INNER JOIN cabinet_dealz.order_requests AS o ON o.id = ship.orderRequestId
WHERE (
    (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(o.originatorEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.localhost'
  )
    OR o.requestNumber LIKE 'VF-TEST-%'
    OR o.requestNumber LIKE 'E2E-CRM-%'
    OR o.requestNumber IN ('TEST-CUSTOMER-1','TEST-CONTRACTOR-1')
    OR o.requestNumber LIKE 'DELETE-%'
    OR IFNULL(o.stripePaymentIntentId,'') LIKE 'pi_synthetic_%'
  )
  AND NOT EXISTS (
      SELECT 1 FROM cabinet_dealz.crm_deals AS d
      WHERE d.orderRequestId = o.id
        AND d.contactEmail IS NOT NULL
        AND NOT (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(d.contactEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.localhost'
  )
    )
  AND NOT EXISTS (
      SELECT 1 FROM cabinet_dealz.stripe_payment_records AS s
      WHERE s.orderRequestId = o.id
        AND s.livemode = 1
        AND s.stripeMode = 'live'
        AND (s.customerEmail IS NULL OR NOT (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(s.customerEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.localhost'
  ))
    );

-- D4. Same rows as P6.
SELECT cost.id, cost.orderRequestId, o.requestNumber, o.originatorEmail, o.orderKind
FROM cabinet_dealz.order_request_line_costs AS cost
INNER JOIN cabinet_dealz.order_requests AS o ON o.id = cost.orderRequestId
WHERE (
    (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(o.originatorEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.localhost'
  )
    OR o.requestNumber LIKE 'VF-TEST-%'
    OR o.requestNumber LIKE 'E2E-CRM-%'
    OR o.requestNumber IN ('TEST-CUSTOMER-1','TEST-CONTRACTOR-1')
    OR o.requestNumber LIKE 'DELETE-%'
    OR IFNULL(o.stripePaymentIntentId,'') LIKE 'pi_synthetic_%'
  )
  AND NOT EXISTS (
      SELECT 1 FROM cabinet_dealz.crm_deals AS d
      WHERE d.orderRequestId = o.id
        AND d.contactEmail IS NOT NULL
        AND NOT (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(d.contactEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.localhost'
  )
    )
  AND NOT EXISTS (
      SELECT 1 FROM cabinet_dealz.stripe_payment_records AS s
      WHERE s.orderRequestId = o.id
        AND s.livemode = 1
        AND s.stripeMode = 'live'
        AND (s.customerEmail IS NULL OR NOT (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(s.customerEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.localhost'
  ))
    )
ORDER BY cost.id;

DELETE cost
FROM cabinet_dealz.order_request_line_costs AS cost
INNER JOIN cabinet_dealz.order_requests AS o ON o.id = cost.orderRequestId
WHERE (
    (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(o.originatorEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.localhost'
  )
    OR o.requestNumber LIKE 'VF-TEST-%'
    OR o.requestNumber LIKE 'E2E-CRM-%'
    OR o.requestNumber IN ('TEST-CUSTOMER-1','TEST-CONTRACTOR-1')
    OR o.requestNumber LIKE 'DELETE-%'
    OR IFNULL(o.stripePaymentIntentId,'') LIKE 'pi_synthetic_%'
  )
  AND NOT EXISTS (
      SELECT 1 FROM cabinet_dealz.crm_deals AS d
      WHERE d.orderRequestId = o.id
        AND d.contactEmail IS NOT NULL
        AND NOT (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(d.contactEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.localhost'
  )
    )
  AND NOT EXISTS (
      SELECT 1 FROM cabinet_dealz.stripe_payment_records AS s
      WHERE s.orderRequestId = o.id
        AND s.livemode = 1
        AND s.stripeMode = 'live'
        AND (s.customerEmail IS NULL OR NOT (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(s.customerEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.localhost'
  ))
    );

-- D5. Same rows as P7.
SELECT snap.id, snap.orderRequestId, o.requestNumber, o.originatorEmail, o.orderKind
FROM cabinet_dealz.order_request_commerce_snapshots AS snap
INNER JOIN cabinet_dealz.order_requests AS o ON o.id = snap.orderRequestId
WHERE (
    (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(o.originatorEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.localhost'
  )
    OR o.requestNumber LIKE 'VF-TEST-%'
    OR o.requestNumber LIKE 'E2E-CRM-%'
    OR o.requestNumber IN ('TEST-CUSTOMER-1','TEST-CONTRACTOR-1')
    OR o.requestNumber LIKE 'DELETE-%'
    OR IFNULL(o.stripePaymentIntentId,'') LIKE 'pi_synthetic_%'
  )
  AND NOT EXISTS (
      SELECT 1 FROM cabinet_dealz.crm_deals AS d
      WHERE d.orderRequestId = o.id
        AND d.contactEmail IS NOT NULL
        AND NOT (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(d.contactEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.localhost'
  )
    )
  AND NOT EXISTS (
      SELECT 1 FROM cabinet_dealz.stripe_payment_records AS s
      WHERE s.orderRequestId = o.id
        AND s.livemode = 1
        AND s.stripeMode = 'live'
        AND (s.customerEmail IS NULL OR NOT (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(s.customerEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.localhost'
  ))
    )
ORDER BY snap.id;

DELETE snap
FROM cabinet_dealz.order_request_commerce_snapshots AS snap
INNER JOIN cabinet_dealz.order_requests AS o ON o.id = snap.orderRequestId
WHERE (
    (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(o.originatorEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.localhost'
  )
    OR o.requestNumber LIKE 'VF-TEST-%'
    OR o.requestNumber LIKE 'E2E-CRM-%'
    OR o.requestNumber IN ('TEST-CUSTOMER-1','TEST-CONTRACTOR-1')
    OR o.requestNumber LIKE 'DELETE-%'
    OR IFNULL(o.stripePaymentIntentId,'') LIKE 'pi_synthetic_%'
  )
  AND NOT EXISTS (
      SELECT 1 FROM cabinet_dealz.crm_deals AS d
      WHERE d.orderRequestId = o.id
        AND d.contactEmail IS NOT NULL
        AND NOT (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(d.contactEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.localhost'
  )
    )
  AND NOT EXISTS (
      SELECT 1 FROM cabinet_dealz.stripe_payment_records AS s
      WHERE s.orderRequestId = o.id
        AND s.livemode = 1
        AND s.stripeMode = 'live'
        AND (s.customerEmail IS NULL OR NOT (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(s.customerEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.localhost'
  ))
    );

-- D6. Same rows as P8.
SELECT o.id, o.requestNumber, o.orderKind, o.originatorEmail, o.originatorName, o.status, o.stripePaymentIntentId, o.createdAt
FROM cabinet_dealz.order_requests AS o
WHERE (
    (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(o.originatorEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.localhost'
  )
    OR o.requestNumber LIKE 'VF-TEST-%'
    OR o.requestNumber LIKE 'E2E-CRM-%'
    OR o.requestNumber IN ('TEST-CUSTOMER-1','TEST-CONTRACTOR-1')
    OR o.requestNumber LIKE 'DELETE-%'
    OR IFNULL(o.stripePaymentIntentId,'') LIKE 'pi_synthetic_%'
  )
  AND NOT EXISTS (
      SELECT 1 FROM cabinet_dealz.crm_deals AS d
      WHERE d.orderRequestId = o.id
        AND d.contactEmail IS NOT NULL
        AND NOT (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(d.contactEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.localhost'
  )
    )
  AND NOT EXISTS (
      SELECT 1 FROM cabinet_dealz.stripe_payment_records AS s
      WHERE s.orderRequestId = o.id
        AND s.livemode = 1
        AND s.stripeMode = 'live'
        AND (s.customerEmail IS NULL OR NOT (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(s.customerEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.localhost'
  ))
    )
ORDER BY o.id;

DELETE o
FROM cabinet_dealz.order_requests AS o
WHERE (
    (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(o.originatorEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.localhost'
  )
    OR o.requestNumber LIKE 'VF-TEST-%'
    OR o.requestNumber LIKE 'E2E-CRM-%'
    OR o.requestNumber IN ('TEST-CUSTOMER-1','TEST-CONTRACTOR-1')
    OR o.requestNumber LIKE 'DELETE-%'
    OR IFNULL(o.stripePaymentIntentId,'') LIKE 'pi_synthetic_%'
  )
  AND NOT EXISTS (
      SELECT 1 FROM cabinet_dealz.crm_deals AS d
      WHERE d.orderRequestId = o.id
        AND d.contactEmail IS NOT NULL
        AND NOT (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(d.contactEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(d.contactEmail,''))) LIKE '%.localhost'
  )
    )
  AND NOT EXISTS (
      SELECT 1 FROM cabinet_dealz.stripe_payment_records AS s
      WHERE s.orderRequestId = o.id
        AND s.livemode = 1
        AND s.stripeMode = 'live'
        AND (s.customerEmail IS NULL OR NOT (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(s.customerEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(s.customerEmail,''))) LIKE '%.localhost'
  ))
    );

-- D7. Same rows as P10.
SELECT activity.id, activity.dealId, deal.contactEmail, deal.contactName, deal.title
FROM cabinet_dealz.crm_activities AS activity
INNER JOIN cabinet_dealz.crm_deals AS deal ON deal.id = activity.dealId
WHERE (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(deal.contactEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.localhost'
  )
  AND NOT EXISTS (
    SELECT 1 FROM cabinet_dealz.sales_commissions AS commission
    WHERE commission.dealId = deal.id AND commission.status = 'paid'
  )
ORDER BY activity.id;

DELETE activity
FROM cabinet_dealz.crm_activities AS activity
INNER JOIN cabinet_dealz.crm_deals AS deal ON deal.id = activity.dealId
WHERE (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(deal.contactEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.localhost'
  )
  AND NOT EXISTS (
    SELECT 1 FROM cabinet_dealz.sales_commissions AS commission
    WHERE commission.dealId = deal.id AND commission.status = 'paid'
  );

-- D8. Same rows as P11.
SELECT link.id, link.dealId, deal.contactEmail, deal.title
FROM cabinet_dealz.crm_deal_designs AS link
INNER JOIN cabinet_dealz.crm_deals AS deal ON deal.id = link.dealId
WHERE (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(deal.contactEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.localhost'
  )
  AND NOT EXISTS (
    SELECT 1 FROM cabinet_dealz.sales_commissions AS commission
    WHERE commission.dealId = deal.id AND commission.status = 'paid'
  )
ORDER BY link.id;

DELETE link
FROM cabinet_dealz.crm_deal_designs AS link
INNER JOIN cabinet_dealz.crm_deals AS deal ON deal.id = link.dealId
WHERE (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(deal.contactEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.localhost'
  )
  AND NOT EXISTS (
    SELECT 1 FROM cabinet_dealz.sales_commissions AS commission
    WHERE commission.dealId = deal.id AND commission.status = 'paid'
  );

-- D9. Same rows as P12.
SELECT mail.id, mail.dealId, mail.toEmail, deal.contactEmail, deal.title
FROM cabinet_dealz.crm_email_log AS mail
INNER JOIN cabinet_dealz.crm_deals AS deal ON deal.id = mail.dealId
WHERE (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(deal.contactEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.localhost'
  )
  AND NOT EXISTS (
    SELECT 1 FROM cabinet_dealz.sales_commissions AS commission
    WHERE commission.dealId = deal.id AND commission.status = 'paid'
  )
ORDER BY mail.id;

DELETE mail
FROM cabinet_dealz.crm_email_log AS mail
INNER JOIN cabinet_dealz.crm_deals AS deal ON deal.id = mail.dealId
WHERE (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(deal.contactEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.localhost'
  )
  AND NOT EXISTS (
    SELECT 1 FROM cabinet_dealz.sales_commissions AS commission
    WHERE commission.dealId = deal.id AND commission.status = 'paid'
  );

-- D10. Same rows as P13.
SELECT file.id, file.dealId, file.fileName, deal.contactEmail, deal.title
FROM cabinet_dealz.crm_deal_files AS file
INNER JOIN cabinet_dealz.crm_deals AS deal ON deal.id = file.dealId
WHERE (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(deal.contactEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.localhost'
  )
  AND NOT EXISTS (
    SELECT 1 FROM cabinet_dealz.sales_commissions AS commission
    WHERE commission.dealId = deal.id AND commission.status = 'paid'
  )
ORDER BY file.id;

DELETE file
FROM cabinet_dealz.crm_deal_files AS file
INNER JOIN cabinet_dealz.crm_deals AS deal ON deal.id = file.dealId
WHERE (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(deal.contactEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.localhost'
  )
  AND NOT EXISTS (
    SELECT 1 FROM cabinet_dealz.sales_commissions AS commission
    WHERE commission.dealId = deal.id AND commission.status = 'paid'
  );

-- D11. Same rows as P14.
SELECT commission.id, commission.dealId, commission.status, commission.amountCents, deal.contactEmail, deal.title
FROM cabinet_dealz.sales_commissions AS commission
INNER JOIN cabinet_dealz.crm_deals AS deal ON deal.id = commission.dealId
WHERE (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(deal.contactEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.localhost'
  )
  AND NOT EXISTS (
    SELECT 1 FROM cabinet_dealz.sales_commissions AS commission
    WHERE commission.dealId = deal.id AND commission.status = 'paid'
  )
  AND commission.status <> 'paid'
ORDER BY commission.id;

DELETE commission
FROM cabinet_dealz.sales_commissions AS commission
INNER JOIN cabinet_dealz.crm_deals AS deal ON deal.id = commission.dealId
WHERE (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(deal.contactEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.localhost'
  )
  AND NOT EXISTS (
    SELECT 1 FROM cabinet_dealz.sales_commissions AS commission
    WHERE commission.dealId = deal.id AND commission.status = 'paid'
  )
  AND commission.status <> 'paid';

-- D12. Same rows as P15.
SELECT deal.id, deal.title, deal.contactEmail, deal.contactName, deal.company, deal.stage, deal.source, deal.createdAt
FROM cabinet_dealz.crm_deals AS deal
WHERE (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(deal.contactEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.localhost'
  )
  AND NOT EXISTS (
    SELECT 1 FROM cabinet_dealz.sales_commissions AS commission
    WHERE commission.dealId = deal.id AND commission.status = 'paid'
  )
ORDER BY deal.id;

DELETE deal
FROM cabinet_dealz.crm_deals AS deal
WHERE (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(deal.contactEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.localhost'
  )
  AND NOT EXISTS (
    SELECT 1 FROM cabinet_dealz.sales_commissions AS commission
    WHERE commission.dealId = deal.id AND commission.status = 'paid'
  );

-- D13. Same rows as P17.
SELECT lead.id, lead.email, lead.name, lead.phone, lead.source, lead.createdAt
FROM cabinet_dealz.design_leads AS lead
WHERE (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(lead.email,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(lead.email,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(lead.email,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(lead.email,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(lead.email,''))) LIKE '%.localhost'
  )
ORDER BY lead.id;

DELETE lead
FROM cabinet_dealz.design_leads AS lead
WHERE (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(lead.email,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(lead.email,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(lead.email,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(lead.email,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(lead.email,''))) LIKE '%.localhost'
  );

-- D14. Same rows as P18.
SELECT consult.id, consult.customerEmail, consult.customerName, consult.status, consult.startAt, consult.createdAt
FROM cabinet_dealz.design_consultations AS consult
WHERE (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(consult.customerEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(consult.customerEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(consult.customerEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(consult.customerEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(consult.customerEmail,''))) LIKE '%.localhost'
  )
ORDER BY consult.id;

DELETE consult
FROM cabinet_dealz.design_consultations AS consult
WHERE (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(consult.customerEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(consult.customerEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(consult.customerEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(consult.customerEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(consult.customerEmail,''))) LIKE '%.localhost'
  );

-- D15. Same rows as P19.
SELECT stripe.id, stripe.customerEmail, stripe.customerName, stripe.status, stripe.stripeMode, stripe.livemode, stripe.purpose, stripe.amountCents, stripe.createdAt
FROM cabinet_dealz.stripe_payment_records AS stripe
WHERE stripe.stripeMode = 'test'
  AND (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(stripe.customerEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(stripe.customerEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(stripe.customerEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(stripe.customerEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(stripe.customerEmail,''))) LIKE '%.localhost'
  )
ORDER BY stripe.id;

DELETE stripe
FROM cabinet_dealz.stripe_payment_records AS stripe
WHERE stripe.stripeMode = 'test'
  AND (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(stripe.customerEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(stripe.customerEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(stripe.customerEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(stripe.customerEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(stripe.customerEmail,''))) LIKE '%.localhost'
  );

-- D16. Same rows as P21.
SELECT app.id, app.email, app.contactName, app.companyName, app.status, app.createdAt
FROM cabinet_dealz.pro_applications AS app
WHERE (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(app.email,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(app.email,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(app.email,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(app.email,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(app.email,''))) LIKE '%.localhost'
  )
ORDER BY app.id;

DELETE app
FROM cabinet_dealz.pro_applications AS app
WHERE (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(app.email,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(app.email,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(app.email,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(app.email,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(app.email,''))) LIKE '%.localhost'
  );

-- D17. Same rows as P22.
SELECT app.id, app.email, app.contactName, app.companyName, app.status, app.createdAt
FROM cabinet_dealz.vendor_applications AS app
WHERE (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(app.email,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(app.email,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(app.email,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(app.email,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(app.email,''))) LIKE '%.localhost'
  )
ORDER BY app.id;

DELETE app
FROM cabinet_dealz.vendor_applications AS app
WHERE (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(app.email,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(app.email,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(app.email,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(app.email,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(app.email,''))) LIKE '%.localhost'
  );

-- D18. Same rows as P23.
SELECT ref.id, ref.email, ref.vendorName, ref.contactName, ref.status, ref.createdAt
FROM cabinet_dealz.vendor_referrals AS ref
WHERE (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(ref.email,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(ref.email,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(ref.email,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(ref.email,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(ref.email,''))) LIKE '%.localhost'
  )
ORDER BY ref.id;

DELETE ref
FROM cabinet_dealz.vendor_referrals AS ref
WHERE (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(ref.email,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(ref.email,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(ref.email,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(ref.email,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(ref.email,''))) LIKE '%.localhost'
  );

-- D19. Same rows as P24.
SELECT req.id, req.contractorEmail, req.contractorName, req.businessName, req.status, req.createdAt
FROM cabinet_dealz.contractor_access_requests AS req
WHERE (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(req.contractorEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(req.contractorEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(req.contractorEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(req.contractorEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(req.contractorEmail,''))) LIKE '%.localhost'
  )
ORDER BY req.id;

DELETE req
FROM cabinet_dealz.contractor_access_requests AS req
WHERE (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(req.contractorEmail,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(req.contractorEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(req.contractorEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(req.contractorEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(req.contractorEmail,''))) LIKE '%.localhost'
  );

-- D20. Same rows as P25.
SELECT id, contractorUserId, name, email, notes, createdAt
FROM cabinet_dealz.contractor_customers
WHERE (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(email,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(email,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(email,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(email,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(email,''))) LIKE '%.localhost'
  )
ORDER BY id;

DELETE customer
FROM cabinet_dealz.contractor_customers AS customer
WHERE (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(customer.email,'')), '@', -1)) IN ('example.com','example.org','example.net','example.edu','example.invalid','test.com','mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(customer.email,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(customer.email,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(customer.email,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(customer.email,''))) LIKE '%.localhost'
  );

-- Puts every delete above back. Change to COMMIT only after Part 1 is reviewed.
ROLLBACK;

-- ---------------------------------------------------------------------------
-- Optional, and commented out on purpose. Run only after Part 0 says the
-- table is present (present = 1). Uncomment one SELECT, read it, and only
-- then consider the matching DELETE in a mysql client that can ROLLBACK.
-- If the table does not exist, leave the block commented.
-- ---------------------------------------------------------------------------

-- P30. Shops saved on a test countertop quote.
-- Table: cabinet_dealz.countertop_quote_fab_shops, created by docs/sql/0291.
-- The live Countertop Quotes card says 0291 is not applied, so this table
-- should be missing today. There is nothing to delete until 0291 has run
-- AND a later test quote has saved shop matches.
--
-- SELECT link.id, link.quoteId, link.fabShopId, quote.contactEmail, quote.notes
-- FROM cabinet_dealz.countertop_quote_fab_shops AS link
-- INNER JOIN cabinet_dealz.countertop_quotes AS quote ON quote.id = link.quoteId
-- WHERE LOWER(SUBSTRING_INDEX(TRIM(IFNULL(quote.contactEmail,'')), '@', -1)) IN (
--         'example.com','example.org','example.net','example.edu','example.invalid','test.com',
--         'mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com',
--         '10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com',
--         'cabinetdealz.test')
--    OR LOWER(TRIM(IFNULL(quote.contactEmail,''))) LIKE '%.test'
--    OR LOWER(TRIM(IFNULL(quote.contactEmail,''))) LIKE '%.invalid'
--    OR LOWER(TRIM(IFNULL(quote.contactEmail,''))) LIKE '%.example'
--    OR LOWER(TRIM(IFNULL(quote.contactEmail,''))) LIKE '%.localhost'
--    OR quote.notes = 'vitest countertop request'
-- ORDER BY link.id;

-- D21. Same rows as P30. Do not paste into the TiDB SQL editor.
-- DELETE link
-- FROM cabinet_dealz.countertop_quote_fab_shops AS link
-- INNER JOIN cabinet_dealz.countertop_quotes AS quote ON quote.id = link.quoteId
-- WHERE LOWER(SUBSTRING_INDEX(TRIM(IFNULL(quote.contactEmail,'')), '@', -1)) IN (
--         'example.com','example.org','example.net','example.edu','example.invalid','test.com',
--         'mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com',
--         '10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com',
--         'cabinetdealz.test')
--    OR LOWER(TRIM(IFNULL(quote.contactEmail,''))) LIKE '%.test'
--    OR LOWER(TRIM(IFNULL(quote.contactEmail,''))) LIKE '%.invalid'
--    OR LOWER(TRIM(IFNULL(quote.contactEmail,''))) LIKE '%.example'
--    OR LOWER(TRIM(IFNULL(quote.contactEmail,''))) LIKE '%.localhost'
--    OR quote.notes = 'vitest countertop request';

-- P31. Designer Helper Requests with a test email.
-- Table: cabinet_dealz.designer_helper_requests, created by cabinet-frontend
-- docs/sql/0257_designer_helper_queue.tidb.sql (not in this repo).
--
-- SELECT id, customerEmail, customerName, designName, status, requestedAt
-- FROM cabinet_dealz.designer_helper_requests
-- WHERE LOWER(SUBSTRING_INDEX(TRIM(IFNULL(customerEmail,'')), '@', -1)) IN (
--         'example.com','example.org','example.net','example.edu','example.invalid','test.com',
--         'mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com',
--         '10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com',
--         'cabinetdealz.test')
--    OR LOWER(TRIM(IFNULL(customerEmail,''))) LIKE '%.test'
--    OR LOWER(TRIM(IFNULL(customerEmail,''))) LIKE '%.invalid'
--    OR LOWER(TRIM(IFNULL(customerEmail,''))) LIKE '%.example'
--    OR LOWER(TRIM(IFNULL(customerEmail,''))) LIKE '%.localhost'
-- ORDER BY id;

-- D22. Same rows as P31. Do not paste into the TiDB SQL editor.
-- DELETE request_row
-- FROM cabinet_dealz.designer_helper_requests AS request_row
-- WHERE LOWER(SUBSTRING_INDEX(TRIM(IFNULL(request_row.customerEmail,'')), '@', -1)) IN (
--         'example.com','example.org','example.net','example.edu','example.invalid','test.com',
--         'mailinator.com','guerrillamail.com','yopmail.com','tempmail.com','trashmail.com',
--         '10minutemail.com','sharklasers.com','discard.email','fakeinbox.com','mailnull.com',
--         'cabinetdealz.test')
--    OR LOWER(TRIM(IFNULL(request_row.customerEmail,''))) LIKE '%.test'
--    OR LOWER(TRIM(IFNULL(request_row.customerEmail,''))) LIKE '%.invalid'
--    OR LOWER(TRIM(IFNULL(request_row.customerEmail,''))) LIKE '%.example'
--    OR LOWER(TRIM(IFNULL(request_row.customerEmail,''))) LIKE '%.localhost';
