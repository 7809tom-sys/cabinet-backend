-- Review only. NOT RUN. Do not paste this into production.
--
-- Database: TiDB Cloud, schema cabinet_dealz.
-- Repo: cabinet-backend (the API for cabinetdealz.com). Not cabinet-dealz1.
--
-- What this file is: a preview of admin rows that are clearly test data, then a
-- delete of only those rows, inside a transaction that ends in ROLLBACK.
-- Running the whole file in a mysql client shows the would-delete counts and
-- then puts every row back. Nothing stays deleted.
--
-- The TiDB Cloud SQL editor commits each statement on its own. Do not paste
-- Part 2 there. Part 1 (the SELECT statements) is safe to paste one at a time.
-- To apply later, after the preview looks right, run Part 2 in a mysql client
-- and change the final ROLLBACK to COMMIT. Do not do that from this review.
--
-- If any Part 2 statement errors, run ROLLBACK immediately and stop.
-- "Table doesn't exist" on the fabrication-shop delete is expected until
-- docs/sql/0291_fabrication_shops_countertop_zip.tidb.sql has been applied.
-- Skip that one statement. 0291 is a separate file and is not part of this cleanup.
--
-- What counts as a test row (nothing else is deleted):
--   * Email domain is a reserved or disposable test domain:
--     example.com, example.org, example.net, example.edu,
--     test.com, mailinator.com, guerrillamail.com, yopmail.com,
--     tempmail.com, trashmail.com, 10minutemail.com, sharklasers.com,
--     discard.email, fakeinbox.com, mailnull.com, cabinetdealz.test,
--     or the address ends in .test, .invalid, .example, or .localhost.
--   * Countertop quote note is exactly "vitest countertop request"
--     (server/design.countertop.test.ts writes buyer@example.com,
--     32.5 sq ft, 18 lin ft, island, ZIP 75201, and does not delete the row).
--   * Order request number starts with VF-TEST- or E2E-CRM-,
--     or stripePaymentIntentId starts with pi_synthetic_.
--
-- What this file does not delete:
--   * Any @cabinetdealz.com, @gmail.com, or other real-domain customer.
--   * users, affiliates, kitchen_designs, fabrication_shops, catalog, inventory.
--   * A test-looking order that a non-test CRM deal or a live Stripe charge
--     (livemode = 1, customer email not a test domain) still points at.
--   * A test-looking CRM deal that has a sales commission already marked paid.
--   * Stripe rows in test mode whose customer email is a real domain.
--     Part 1 lists those so they can be reviewed by hand.
--
-- The Admin "CRM Cleanup" screen is a different tool. It also flags example.com
-- addresses, and it can delete users. Do not run that tool and this script
-- in the same sitting.

-- ---------------------------------------------------------------------------
-- Part 1. Read-only. Safe to paste one statement at a time.
-- ---------------------------------------------------------------------------

-- 1. The quotes on the Countertop Quotes tab that match the Oct 20 screenshot.
SELECT id, contactEmail, contactName, status, zip, squareFeet, linearFeet, hasIsland, notes, createdAt
FROM cabinet_dealz.countertop_quotes
WHERE contactEmail = 'buyer@example.com'
  AND squareFeet = 32.50
  AND linearFeet = 18.00
  AND zip = '75201'
  AND status = 'new'
ORDER BY id;

-- 2. Every countertop quote this script would delete, and how many it would keep.
SELECT
  SUM(CASE WHEN LOWER(SUBSTRING_INDEX(TRIM(contactEmail), '@', -1)) IN (
        'example.com','example.org','example.net','example.edu','test.com','mailinator.com',
        'guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com',
        'sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
      OR LOWER(TRIM(contactEmail)) LIKE '%.test'
      OR LOWER(TRIM(contactEmail)) LIKE '%.invalid'
      OR LOWER(TRIM(contactEmail)) LIKE '%.example'
      OR LOWER(TRIM(contactEmail)) LIKE '%.localhost'
      OR notes = 'vitest countertop request'
    THEN 1 ELSE 0 END) AS wouldDelete,
  SUM(CASE WHEN NOT (
        LOWER(SUBSTRING_INDEX(TRIM(contactEmail), '@', -1)) IN (
          'example.com','example.org','example.net','example.edu','test.com','mailinator.com',
          'guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com',
          'sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
        OR LOWER(TRIM(contactEmail)) LIKE '%.test'
        OR LOWER(TRIM(contactEmail)) LIKE '%.invalid'
        OR LOWER(TRIM(contactEmail)) LIKE '%.example'
        OR LOWER(TRIM(contactEmail)) LIKE '%.localhost'
        OR notes = 'vitest countertop request')
    THEN 1 ELSE 0 END) AS wouldKeep,
  COUNT(*) AS totalQuotes
FROM cabinet_dealz.countertop_quotes;

-- 3. Sample of quotes that would be kept (real customers). Do not delete these.
SELECT id, contactEmail, contactName, status, zip, squareFeet, createdAt
FROM cabinet_dealz.countertop_quotes
WHERE NOT (
    LOWER(SUBSTRING_INDEX(TRIM(contactEmail), '@', -1)) IN (
      'example.com','example.org','example.net','example.edu','test.com','mailinator.com',
      'guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com',
      'sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(contactEmail)) LIKE '%.test'
    OR LOWER(TRIM(contactEmail)) LIKE '%.invalid'
    OR LOWER(TRIM(contactEmail)) LIKE '%.example'
    OR LOWER(TRIM(contactEmail)) LIKE '%.localhost'
    OR notes = 'vitest countertop request')
ORDER BY id DESC
LIMIT 15;

-- 4. Incoming Orders, Master Orders, and Sample Orders all read order_requests.
--    orderKind = 'sample' is the Sample Orders tab. standard is the other two.
SELECT orderKind,
  SUM(CASE WHEN LOWER(SUBSTRING_INDEX(TRIM(originatorEmail), '@', -1)) IN (
        'example.com','example.org','example.net','example.edu','test.com','mailinator.com',
        'guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com',
        'sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
      OR LOWER(TRIM(IFNULL(originatorEmail,''))) LIKE '%.test'
      OR LOWER(TRIM(IFNULL(originatorEmail,''))) LIKE '%.invalid'
      OR LOWER(TRIM(IFNULL(originatorEmail,''))) LIKE '%.example'
      OR LOWER(TRIM(IFNULL(originatorEmail,''))) LIKE '%.localhost'
      OR requestNumber LIKE 'VF-TEST-%'
      OR requestNumber LIKE 'E2E-CRM-%'
      OR IFNULL(stripePaymentIntentId,'') LIKE 'pi_synthetic_%'
    THEN 1 ELSE 0 END) AS wouldDelete,
  COUNT(*) AS totalRows
FROM cabinet_dealz.order_requests
GROUP BY orderKind;

-- 5. Orders that look like tests but are held because a real CRM deal or a live
--    Stripe charge still points at them. Part 2 does not delete these.
SELECT o.id, o.requestNumber, o.originatorEmail, o.originatorName, o.orderKind, o.status, o.createdAt
FROM cabinet_dealz.order_requests o
WHERE (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(o.originatorEmail,'')), '@', -1)) IN (
      'example.com','example.org','example.net','example.edu','test.com','mailinator.com',
      'guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com',
      'sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.localhost'
    OR o.requestNumber LIKE 'VF-TEST-%'
    OR o.requestNumber LIKE 'E2E-CRM-%'
    OR IFNULL(o.stripePaymentIntentId,'') LIKE 'pi_synthetic_%'
  )
  AND (
    EXISTS (
      SELECT 1 FROM cabinet_dealz.crm_deals d
      WHERE d.orderRequestId = o.id
        AND d.contactEmail IS NOT NULL
        AND NOT (
          LOWER(SUBSTRING_INDEX(TRIM(d.contactEmail), '@', -1)) IN (
            'example.com','example.org','example.net','example.edu','test.com','mailinator.com',
            'guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com',
            'sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
          OR LOWER(TRIM(d.contactEmail)) LIKE '%.test'
          OR LOWER(TRIM(d.contactEmail)) LIKE '%.invalid'
          OR LOWER(TRIM(d.contactEmail)) LIKE '%.example'
          OR LOWER(TRIM(d.contactEmail)) LIKE '%.localhost')
    )
    OR EXISTS (
      SELECT 1 FROM cabinet_dealz.stripe_payment_records s
      WHERE s.orderRequestId = o.id
        AND s.livemode = 1
        AND (s.customerEmail IS NULL OR NOT (
          LOWER(SUBSTRING_INDEX(TRIM(s.customerEmail), '@', -1)) IN (
            'example.com','example.org','example.net','example.edu','test.com','mailinator.com',
            'guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com',
            'sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
          OR LOWER(TRIM(s.customerEmail)) LIKE '%.test'
          OR LOWER(TRIM(s.customerEmail)) LIKE '%.invalid'
          OR LOWER(TRIM(s.customerEmail)) LIKE '%.example'
          OR LOWER(TRIM(s.customerEmail)) LIKE '%.localhost'))
    )
  )
ORDER BY o.id
LIMIT 50;

-- 6. Sales CRM, Design Leads, Consultations, Payments, Stripe Invoices, Pro Applications.
--    One count per table. wouldDelete is the test-domain count only.
SELECT 'crm_deals' AS tbl,
  SUM(CASE WHEN LOWER(SUBSTRING_INDEX(TRIM(IFNULL(contactEmail,'')), '@', -1)) IN (
        'example.com','example.org','example.net','example.edu','test.com','mailinator.com',
        'guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com',
        'sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
      OR LOWER(TRIM(IFNULL(contactEmail,''))) LIKE '%.test'
      OR LOWER(TRIM(IFNULL(contactEmail,''))) LIKE '%.invalid'
      OR LOWER(TRIM(IFNULL(contactEmail,''))) LIKE '%.example'
      OR LOWER(TRIM(IFNULL(contactEmail,''))) LIKE '%.localhost'
    THEN 1 ELSE 0 END) AS wouldDelete,
  COUNT(*) AS totalRows
FROM cabinet_dealz.crm_deals
UNION ALL
SELECT 'design_leads',
  SUM(CASE WHEN LOWER(SUBSTRING_INDEX(TRIM(email), '@', -1)) IN (
        'example.com','example.org','example.net','example.edu','test.com','mailinator.com',
        'guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com',
        'sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
      OR LOWER(TRIM(email)) LIKE '%.test' OR LOWER(TRIM(email)) LIKE '%.invalid'
      OR LOWER(TRIM(email)) LIKE '%.example' OR LOWER(TRIM(email)) LIKE '%.localhost'
    THEN 1 ELSE 0 END),
  COUNT(*) FROM cabinet_dealz.design_leads
UNION ALL
SELECT 'design_consultations',
  SUM(CASE WHEN LOWER(SUBSTRING_INDEX(TRIM(customerEmail), '@', -1)) IN (
        'example.com','example.org','example.net','example.edu','test.com','mailinator.com',
        'guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com',
        'sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
      OR LOWER(TRIM(customerEmail)) LIKE '%.test' OR LOWER(TRIM(customerEmail)) LIKE '%.invalid'
      OR LOWER(TRIM(customerEmail)) LIKE '%.example' OR LOWER(TRIM(customerEmail)) LIKE '%.localhost'
    THEN 1 ELSE 0 END),
  COUNT(*) FROM cabinet_dealz.design_consultations
UNION ALL
SELECT 'payments',
  SUM(CASE WHEN LOWER(SUBSTRING_INDEX(TRIM(IFNULL(payerEmail,'')), '@', -1)) IN (
        'example.com','example.org','example.net','example.edu','test.com','mailinator.com',
        'guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com',
        'sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
      OR LOWER(TRIM(IFNULL(payerEmail,''))) LIKE '%.test' OR LOWER(TRIM(IFNULL(payerEmail,''))) LIKE '%.invalid'
      OR LOWER(TRIM(IFNULL(payerEmail,''))) LIKE '%.example' OR LOWER(TRIM(IFNULL(payerEmail,''))) LIKE '%.localhost'
    THEN 1 ELSE 0 END),
  COUNT(*) FROM cabinet_dealz.payments
UNION ALL
SELECT 'stripe_payment_records',
  SUM(CASE WHEN LOWER(SUBSTRING_INDEX(TRIM(IFNULL(customerEmail,'')), '@', -1)) IN (
        'example.com','example.org','example.net','example.edu','test.com','mailinator.com',
        'guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com',
        'sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
      OR LOWER(TRIM(IFNULL(customerEmail,''))) LIKE '%.test' OR LOWER(TRIM(IFNULL(customerEmail,''))) LIKE '%.invalid'
      OR LOWER(TRIM(IFNULL(customerEmail,''))) LIKE '%.example' OR LOWER(TRIM(IFNULL(customerEmail,''))) LIKE '%.localhost'
    THEN 1 ELSE 0 END),
  COUNT(*) FROM cabinet_dealz.stripe_payment_records
UNION ALL
SELECT 'pro_applications',
  SUM(CASE WHEN LOWER(SUBSTRING_INDEX(TRIM(email), '@', -1)) IN (
        'example.com','example.org','example.net','example.edu','test.com','mailinator.com',
        'guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com',
        'sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
      OR LOWER(TRIM(email)) LIKE '%.test' OR LOWER(TRIM(email)) LIKE '%.invalid'
      OR LOWER(TRIM(email)) LIKE '%.example' OR LOWER(TRIM(email)) LIKE '%.localhost'
    THEN 1 ELSE 0 END),
  COUNT(*) FROM cabinet_dealz.pro_applications;

-- 7. Stripe Invoices that are Stripe test mode but have a real-looking email.
--    Listed for review. Part 2 does not delete them.
SELECT id, customerEmail, customerName, status, stripeMode, livemode, purpose, amountCents, createdAt
FROM cabinet_dealz.stripe_payment_records
WHERE stripeMode = 'test'
  AND NOT (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(customerEmail,'')), '@', -1)) IN (
      'example.com','example.org','example.net','example.edu','test.com','mailinator.com',
      'guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com',
      'sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(customerEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(customerEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(customerEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(customerEmail,''))) LIKE '%.localhost')
ORDER BY id DESC
LIMIT 30;

-- 8. Users with a test-domain email. Part 2 does not delete users.
--    Admin -> CRM Cleanup is the tool that can remove accounts, and it keeps
--    Tom and the named staff list. Review this list before using that tool.
SELECT id, email, name, role, createdAt
FROM cabinet_dealz.users
WHERE LOWER(SUBSTRING_INDEX(TRIM(IFNULL(email,'')), '@', -1)) IN (
      'example.com','example.org','example.net','example.edu','test.com','mailinator.com',
      'guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com',
      'sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
   OR LOWER(TRIM(IFNULL(email,''))) LIKE '%.test'
   OR LOWER(TRIM(IFNULL(email,''))) LIKE '%.invalid'
   OR LOWER(TRIM(IFNULL(email,''))) LIKE '%.example'
   OR LOWER(TRIM(IFNULL(email,''))) LIKE '%.localhost'
ORDER BY id
LIMIT 50;

-- 9. Designer Helper Requests. Skip this statement if the table does not exist
--    (docs/sql for it lives in cabinet-frontend as 0257 and is not in this repo).
-- SELECT status, COUNT(*) AS rows FROM cabinet_dealz.designer_helper_requests GROUP BY status;

-- ---------------------------------------------------------------------------
-- Part 2. Deletes, then ROLLBACK. Do not paste into the TiDB SQL editor.
-- Replace ROLLBACK with COMMIT only after Part 1 has been reviewed.
-- ---------------------------------------------------------------------------

START TRANSACTION;

-- Quotes. Child shop matches first, only when 0291 has created that table.
DELETE link
FROM cabinet_dealz.countertop_quote_fab_shops AS link
INNER JOIN cabinet_dealz.countertop_quotes AS quote ON quote.id = link.quoteId
WHERE LOWER(SUBSTRING_INDEX(TRIM(quote.contactEmail), '@', -1)) IN (
      'example.com','example.org','example.net','example.edu','test.com','mailinator.com',
      'guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com',
      'sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
   OR LOWER(TRIM(quote.contactEmail)) LIKE '%.test'
   OR LOWER(TRIM(quote.contactEmail)) LIKE '%.invalid'
   OR LOWER(TRIM(quote.contactEmail)) LIKE '%.example'
   OR LOWER(TRIM(quote.contactEmail)) LIKE '%.localhost'
   OR quote.notes = 'vitest countertop request';

DELETE quote
FROM cabinet_dealz.countertop_quotes AS quote
WHERE LOWER(SUBSTRING_INDEX(TRIM(quote.contactEmail), '@', -1)) IN (
      'example.com','example.org','example.net','example.edu','test.com','mailinator.com',
      'guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com',
      'sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
   OR LOWER(TRIM(quote.contactEmail)) LIKE '%.test'
   OR LOWER(TRIM(quote.contactEmail)) LIKE '%.invalid'
   OR LOWER(TRIM(quote.contactEmail)) LIKE '%.example'
   OR LOWER(TRIM(quote.contactEmail)) LIKE '%.localhost'
   OR quote.notes = 'vitest countertop request';

-- Orders that are clearly test and are not held by a real deal or a live charge.
DELETE pay
FROM cabinet_dealz.payments AS pay
INNER JOIN cabinet_dealz.order_requests AS o ON o.id = pay.orderRequestId
WHERE (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(o.originatorEmail,'')), '@', -1)) IN (
      'example.com','example.org','example.net','example.edu','test.com','mailinator.com',
      'guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com',
      'sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.localhost'
    OR o.requestNumber LIKE 'VF-TEST-%'
    OR o.requestNumber LIKE 'E2E-CRM-%'
    OR IFNULL(o.stripePaymentIntentId,'') LIKE 'pi_synthetic_%'
  )
  AND NOT EXISTS (
    SELECT 1 FROM cabinet_dealz.crm_deals AS d
    WHERE d.orderRequestId = o.id
      AND d.contactEmail IS NOT NULL
      AND NOT (
        LOWER(SUBSTRING_INDEX(TRIM(d.contactEmail), '@', -1)) IN (
          'example.com','example.org','example.net','example.edu','test.com','mailinator.com',
          'guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com',
          'sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
        OR LOWER(TRIM(d.contactEmail)) LIKE '%.test'
        OR LOWER(TRIM(d.contactEmail)) LIKE '%.invalid'
        OR LOWER(TRIM(d.contactEmail)) LIKE '%.example'
        OR LOWER(TRIM(d.contactEmail)) LIKE '%.localhost')
  )
  AND NOT EXISTS (
    SELECT 1 FROM cabinet_dealz.stripe_payment_records AS s
    WHERE s.orderRequestId = o.id AND s.livemode = 1
      AND (s.customerEmail IS NULL OR NOT (
        LOWER(SUBSTRING_INDEX(TRIM(s.customerEmail), '@', -1)) IN (
          'example.com','example.org','example.net','example.edu','test.com','mailinator.com',
          'guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com',
          'sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
        OR LOWER(TRIM(s.customerEmail)) LIKE '%.test'
        OR LOWER(TRIM(s.customerEmail)) LIKE '%.invalid'
        OR LOWER(TRIM(s.customerEmail)) LIKE '%.example'
        OR LOWER(TRIM(s.customerEmail)) LIKE '%.localhost'))
  );

DELETE ship
FROM cabinet_dealz.order_shipments AS ship
INNER JOIN cabinet_dealz.order_requests AS o ON o.id = ship.orderRequestId
WHERE (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(o.originatorEmail,'')), '@', -1)) IN (
      'example.com','example.org','example.net','example.edu','test.com','mailinator.com',
      'guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com',
      'sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.localhost'
    OR o.requestNumber LIKE 'VF-TEST-%'
    OR o.requestNumber LIKE 'E2E-CRM-%'
    OR IFNULL(o.stripePaymentIntentId,'') LIKE 'pi_synthetic_%'
  )
  AND NOT EXISTS (
    SELECT 1 FROM cabinet_dealz.crm_deals AS d
    WHERE d.orderRequestId = o.id
      AND d.contactEmail IS NOT NULL
      AND NOT (
        LOWER(SUBSTRING_INDEX(TRIM(d.contactEmail), '@', -1)) IN (
          'example.com','example.org','example.net','example.edu','test.com','mailinator.com',
          'guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com',
          'sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
        OR LOWER(TRIM(d.contactEmail)) LIKE '%.test'
        OR LOWER(TRIM(d.contactEmail)) LIKE '%.invalid'
        OR LOWER(TRIM(d.contactEmail)) LIKE '%.example'
        OR LOWER(TRIM(d.contactEmail)) LIKE '%.localhost')
  )
  AND NOT EXISTS (
    SELECT 1 FROM cabinet_dealz.stripe_payment_records AS s
    WHERE s.orderRequestId = o.id AND s.livemode = 1
      AND (s.customerEmail IS NULL OR NOT (
        LOWER(SUBSTRING_INDEX(TRIM(s.customerEmail), '@', -1)) IN (
          'example.com','example.org','example.net','example.edu','test.com','mailinator.com',
          'guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com',
          'sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
        OR LOWER(TRIM(s.customerEmail)) LIKE '%.test'
        OR LOWER(TRIM(s.customerEmail)) LIKE '%.invalid'
        OR LOWER(TRIM(s.customerEmail)) LIKE '%.example'
        OR LOWER(TRIM(s.customerEmail)) LIKE '%.localhost'))
  );

DELETE o
FROM cabinet_dealz.order_requests AS o
WHERE (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(o.originatorEmail,'')), '@', -1)) IN (
      'example.com','example.org','example.net','example.edu','test.com','mailinator.com',
      'guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com',
      'sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(o.originatorEmail,''))) LIKE '%.localhost'
    OR o.requestNumber LIKE 'VF-TEST-%'
    OR o.requestNumber LIKE 'E2E-CRM-%'
    OR IFNULL(o.stripePaymentIntentId,'') LIKE 'pi_synthetic_%'
  )
  AND NOT EXISTS (
    SELECT 1 FROM cabinet_dealz.crm_deals AS d
    WHERE d.orderRequestId = o.id
      AND d.contactEmail IS NOT NULL
      AND NOT (
        LOWER(SUBSTRING_INDEX(TRIM(d.contactEmail), '@', -1)) IN (
          'example.com','example.org','example.net','example.edu','test.com','mailinator.com',
          'guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com',
          'sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
        OR LOWER(TRIM(d.contactEmail)) LIKE '%.test'
        OR LOWER(TRIM(d.contactEmail)) LIKE '%.invalid'
        OR LOWER(TRIM(d.contactEmail)) LIKE '%.example'
        OR LOWER(TRIM(d.contactEmail)) LIKE '%.localhost')
  )
  AND NOT EXISTS (
    SELECT 1 FROM cabinet_dealz.stripe_payment_records AS s
    WHERE s.orderRequestId = o.id AND s.livemode = 1
      AND (s.customerEmail IS NULL OR NOT (
        LOWER(SUBSTRING_INDEX(TRIM(s.customerEmail), '@', -1)) IN (
          'example.com','example.org','example.net','example.edu','test.com','mailinator.com',
          'guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com',
          'sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
        OR LOWER(TRIM(s.customerEmail)) LIKE '%.test'
        OR LOWER(TRIM(s.customerEmail)) LIKE '%.invalid'
        OR LOWER(TRIM(s.customerEmail)) LIKE '%.example'
        OR LOWER(TRIM(s.customerEmail)) LIKE '%.localhost'))
  );

-- CRM deals with a test email, and only when no commission has been marked paid.
DELETE activity
FROM cabinet_dealz.crm_activities AS activity
INNER JOIN cabinet_dealz.crm_deals AS deal ON deal.id = activity.dealId
WHERE (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(deal.contactEmail,'')), '@', -1)) IN (
      'example.com','example.org','example.net','example.edu','test.com','mailinator.com',
      'guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com',
      'sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.localhost'
  )
  AND NOT EXISTS (
    SELECT 1 FROM cabinet_dealz.sales_commissions AS commission
    WHERE commission.dealId = deal.id AND commission.status = 'paid'
  );

DELETE link
FROM cabinet_dealz.crm_deal_designs AS link
INNER JOIN cabinet_dealz.crm_deals AS deal ON deal.id = link.dealId
WHERE (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(deal.contactEmail,'')), '@', -1)) IN (
      'example.com','example.org','example.net','example.edu','test.com','mailinator.com',
      'guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com',
      'sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.localhost'
  )
  AND NOT EXISTS (
    SELECT 1 FROM cabinet_dealz.sales_commissions AS commission
    WHERE commission.dealId = deal.id AND commission.status = 'paid'
  );

DELETE deal
FROM cabinet_dealz.crm_deals AS deal
WHERE (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(deal.contactEmail,'')), '@', -1)) IN (
      'example.com','example.org','example.net','example.edu','test.com','mailinator.com',
      'guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com',
      'sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(deal.contactEmail,''))) LIKE '%.localhost'
  )
  AND NOT EXISTS (
    SELECT 1 FROM cabinet_dealz.sales_commissions AS commission
    WHERE commission.dealId = deal.id AND commission.status = 'paid'
  );

DELETE lead
FROM cabinet_dealz.design_leads AS lead
WHERE LOWER(SUBSTRING_INDEX(TRIM(lead.email), '@', -1)) IN (
      'example.com','example.org','example.net','example.edu','test.com','mailinator.com',
      'guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com',
      'sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
   OR LOWER(TRIM(lead.email)) LIKE '%.test'
   OR LOWER(TRIM(lead.email)) LIKE '%.invalid'
   OR LOWER(TRIM(lead.email)) LIKE '%.example'
   OR LOWER(TRIM(lead.email)) LIKE '%.localhost';

DELETE consult
FROM cabinet_dealz.design_consultations AS consult
WHERE LOWER(SUBSTRING_INDEX(TRIM(consult.customerEmail), '@', -1)) IN (
      'example.com','example.org','example.net','example.edu','test.com','mailinator.com',
      'guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com',
      'sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
   OR LOWER(TRIM(consult.customerEmail)) LIKE '%.test'
   OR LOWER(TRIM(consult.customerEmail)) LIKE '%.invalid'
   OR LOWER(TRIM(consult.customerEmail)) LIKE '%.example'
   OR LOWER(TRIM(consult.customerEmail)) LIKE '%.localhost';

DELETE pay
FROM cabinet_dealz.payments AS pay
WHERE LOWER(SUBSTRING_INDEX(TRIM(IFNULL(pay.payerEmail,'')), '@', -1)) IN (
      'example.com','example.org','example.net','example.edu','test.com','mailinator.com',
      'guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com',
      'sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
   OR LOWER(TRIM(IFNULL(pay.payerEmail,''))) LIKE '%.test'
   OR LOWER(TRIM(IFNULL(pay.payerEmail,''))) LIKE '%.invalid'
   OR LOWER(TRIM(IFNULL(pay.payerEmail,''))) LIKE '%.example'
   OR LOWER(TRIM(IFNULL(pay.payerEmail,''))) LIKE '%.localhost';

DELETE stripe
FROM cabinet_dealz.stripe_payment_records AS stripe
WHERE (
    LOWER(SUBSTRING_INDEX(TRIM(IFNULL(stripe.customerEmail,'')), '@', -1)) IN (
      'example.com','example.org','example.net','example.edu','test.com','mailinator.com',
      'guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com',
      'sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
    OR LOWER(TRIM(IFNULL(stripe.customerEmail,''))) LIKE '%.test'
    OR LOWER(TRIM(IFNULL(stripe.customerEmail,''))) LIKE '%.invalid'
    OR LOWER(TRIM(IFNULL(stripe.customerEmail,''))) LIKE '%.example'
    OR LOWER(TRIM(IFNULL(stripe.customerEmail,''))) LIKE '%.localhost'
  );

DELETE app
FROM cabinet_dealz.pro_applications AS app
WHERE LOWER(SUBSTRING_INDEX(TRIM(app.email), '@', -1)) IN (
      'example.com','example.org','example.net','example.edu','test.com','mailinator.com',
      'guerrillamail.com','yopmail.com','tempmail.com','trashmail.com','10minutemail.com',
      'sharklasers.com','discard.email','fakeinbox.com','mailnull.com','cabinetdealz.test')
   OR LOWER(TRIM(app.email)) LIKE '%.test'
   OR LOWER(TRIM(app.email)) LIKE '%.invalid'
   OR LOWER(TRIM(app.email)) LIKE '%.example'
   OR LOWER(TRIM(app.email)) LIKE '%.localhost';

-- Puts every delete above back. Change to COMMIT only after Part 1 is reviewed.
ROLLBACK;
