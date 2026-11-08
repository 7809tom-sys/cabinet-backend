-- TiDB SQL editor version. File is named after the feature: membership plan options.
-- Run this by hand. Nothing runs it automatically: Railway start (`pnpm start`)
-- does not run drizzle migrations, and this feature never writes to a database
-- on its own.
--
-- One statement per line, so every line can be pasted on its own in the TiDB
-- editor. Every table is written as cabinet_dealz.<table>. No table aliases and
-- no reserved words. No IF NOT EXISTS, because TiDB Cloud rejects it here.
--
-- NOTE ON THE NUMBER: this file is 0269 because 0268 (the affiliate app guide)
-- was the last one merged when the feature was written. Sibling PRs are open in
-- parallel and may take 0269 first. If one does, rename this file to the next
-- free number at merge time; the contents do not depend on the number.
--
-- WHY: the affiliate membership used to be a single price, $1,195 a year. It is
-- now two plan options:
--   annual   $1,195 once a year (unchanged for every existing member)
--   monthly  $169 a month, with a three-month minimum commitment
-- The plan and the first date the member may cancel have to be stored, and an
-- invoice has to record which plan and which billing period it covers.
--
-- WHAT EACH COLUMN IS FOR:
--   affiliates.membershipPlan                  'annual' | 'monthly'. Defaults to
--                                              'annual', which is what every
--                                              existing row already is.
--   affiliates.membershipCommittedUntil        first date the member may cancel.
--                                              Monthly: end of the three-month
--                                              minimum. Annual: end of the paid
--                                              year.
--   affiliates.membershipCancelledAt           set when a member cancels. Access
--                                              still runs to membershipExpiresAt.
--   affiliates.membershipStripeSubscriptionId  the Stripe subscription behind a
--                                              monthly plan, so cancelling also
--                                              stops Stripe billing.
--   affiliate_invoices.membershipPlan          which plan the invoice is for.
--   affiliate_invoices.periodNumber            1-based billing period (monthly
--                                              counts 1, 2, 3; annual stays 1).
--   affiliate_invoices.committedUntil          commitment date this payment
--                                              produced.
--
-- SAFE TO RE-RUN? No. TiDB has no ADD COLUMN IF NOT EXISTS, so a second run of
-- an ALTER answers "Duplicate column name". That is harmless (nothing changed),
-- but do not blindly re-paste. Run statement 1 first: it lists any of these
-- columns that already exist, so you can skip those ALTER lines.
--
-- ORDER: statement 1 is a read. Statements 2-9 add the columns. Statement 10 is
-- the backfill and needs statements 2-3 to have run. Statements 11-15 are reads.
-- The application keeps working before this file runs (it falls back to annual,
-- no commitment), so the SQL and the deploy can land in either order.

-- 1. PREVIEW (read-only). Expect zero rows before this file runs. Any row that comes back already exists: skip its matching ALTER below.
SELECT COLUMN_NAME AS existingAffiliateColumn FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'cabinet_dealz' AND TABLE_NAME = 'affiliates' AND COLUMN_NAME IN ('membershipPlan','membershipCommittedUntil','membershipCancelledAt','membershipStripeSubscriptionId') ORDER BY COLUMN_NAME;

-- 2. Which plan the affiliate is on. 'annual' default keeps every existing member exactly as they are.
ALTER TABLE cabinet_dealz.affiliates ADD COLUMN membershipPlan ENUM('annual','monthly') NOT NULL DEFAULT 'annual';

-- 3. First date the member may cancel. Monthly: end of the three-month minimum. Annual: end of the paid year.
ALTER TABLE cabinet_dealz.affiliates ADD COLUMN membershipCommittedUntil TIMESTAMP NULL;

-- 4. Set when a member cancels. Access continues to membershipExpiresAt.
ALTER TABLE cabinet_dealz.affiliates ADD COLUMN membershipCancelledAt TIMESTAMP NULL;

-- 5. Stripe subscription behind a monthly plan. NULL for annual, and for monthly members paid by card, check, or a one-time charge.
ALTER TABLE cabinet_dealz.affiliates ADD COLUMN membershipStripeSubscriptionId VARCHAR(255) NULL;

-- 6. Which plan each invoice is for. Every existing invoice is an annual one.
ALTER TABLE cabinet_dealz.affiliate_invoices ADD COLUMN membershipPlan ENUM('annual','monthly') NOT NULL DEFAULT 'annual';

-- 7. 1-based billing period within the term. Monthly invoices count 1, 2, 3; annual stays 1.
ALTER TABLE cabinet_dealz.affiliate_invoices ADD COLUMN periodNumber INT NOT NULL DEFAULT 1;

-- 8. Commitment date this payment produced, snapshotted on the invoice.
ALTER TABLE cabinet_dealz.affiliate_invoices ADD COLUMN committedUntil TIMESTAMP NULL;

-- 9. PREVIEW (read-only). How many invoices the backfill below will look at. Expect your existing invoice count.
SELECT COUNT(*) AS invoiceCountBeforeBackfill FROM cabinet_dealz.affiliate_invoices;

-- 10. BACKFILL (write). An active member's commitment is the end of the year they already paid for, so the cancel guard reads the same date it would have computed. Only rows with no commitment date are touched, so a re-run changes nothing.
UPDATE cabinet_dealz.affiliates SET membershipCommittedUntil = membershipExpiresAt WHERE membershipCommittedUntil IS NULL AND membershipExpiresAt IS NOT NULL AND membershipStatus = 'active';

-- 11. VERIFY (read-only). Expect 4 rows, one per new affiliates column.
SELECT COLUMN_NAME AS affiliateColumn, COLUMN_TYPE AS columnType, IS_NULLABLE AS isNullable, COLUMN_DEFAULT AS defaultValue FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'cabinet_dealz' AND TABLE_NAME = 'affiliates' AND COLUMN_NAME IN ('membershipPlan','membershipCommittedUntil','membershipCancelledAt','membershipStripeSubscriptionId') ORDER BY COLUMN_NAME;

-- 12. VERIFY (read-only). Expect 3 rows, one per new invoice column.
SELECT COLUMN_NAME AS invoiceColumn, COLUMN_TYPE AS columnType, IS_NULLABLE AS isNullable, COLUMN_DEFAULT AS defaultValue FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'cabinet_dealz' AND TABLE_NAME = 'affiliate_invoices' AND COLUMN_NAME IN ('membershipPlan','periodNumber','committedUntil') ORDER BY COLUMN_NAME;

-- 13. VERIFY (read-only). The plan mix. Before the first monthly member pays this is all 'annual'.
SELECT membershipPlan AS plan, membershipStatus AS status, COUNT(*) AS memberCount FROM cabinet_dealz.affiliates GROUP BY membershipPlan, membershipStatus ORDER BY membershipPlan, membershipStatus;

-- 14. VERIFY (read-only). Invoices by plan and status.
SELECT membershipPlan AS plan, status AS invoiceStatus, COUNT(*) AS invoiceCount, SUM(amountCents) AS totalCents FROM cabinet_dealz.affiliate_invoices GROUP BY membershipPlan, status ORDER BY membershipPlan, status;

-- 15. VERIFY (read-only). Active members with no commitment date left (should be zero after statement 10).
SELECT id AS affiliateId, storeName AS storeName, membershipPlan AS plan, membershipExpiresAt AS membershipExpiresAt FROM cabinet_dealz.affiliates WHERE membershipCommittedUntil IS NULL AND membershipStatus = 'active' ORDER BY id;
