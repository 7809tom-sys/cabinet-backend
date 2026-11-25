-- TiDB SQL editor version. Numbered 0288. Run after 0287.
-- Paste each numbered block on its own. One statement per block.
-- Every table is cabinet_dealz.<table>.
--
-- What it does: adds ONE new table, designer_subscriptions, for the two
-- monthly designer plans Tom set on Nov 25, 2026:
--   designer_website  $11.99/month  Designer + custom website + purchasing club
--   designer_only     $15.99/month  Designer only
-- Add-only. No existing table, column, or price is changed. The affiliate
-- membership ($169/month or $1,195/year) is untouched. Until this file is run,
-- the pricing page still shows both plans and Stripe Checkout still opens; the
-- webhook logs a paid plan and skips the row instead of failing.
-- CREATE TABLE IF NOT EXISTS is safe to run twice. Block 2 is read-only.

-- 1. One row per Stripe subscription.
CREATE TABLE IF NOT EXISTS cabinet_dealz.designer_subscriptions (
  id INT NOT NULL AUTO_INCREMENT,
  userId INT NOT NULL,
  tier ENUM('designer_website','designer_only') NOT NULL,
  status ENUM('active','past_due','cancelled') NOT NULL DEFAULT 'active',
  amountCents INT NOT NULL,
  stripeSubscriptionId VARCHAR(255) NOT NULL,
  stripeCustomerId VARCHAR(255) NULL,
  stripeCheckoutSessionId VARCHAR(255) NULL,
  lastStripeInvoiceId VARCHAR(255) NULL,
  currentPeriodEnd TIMESTAMP NULL,
  cancelAtPeriodEnd TINYINT(1) NOT NULL DEFAULT 0,
  cancelledAt TIMESTAMP NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY designer_subscriptions_stripe_subscription_uq (stripeSubscriptionId),
  KEY designer_subscriptions_user_idx (userId, status)
);

-- 2. Read-only check. tablePresent = 1, columnsPresent = 14, rowCount = 0 on a fresh run.
SELECT
  (SELECT COUNT(*) FROM information_schema.tables
     WHERE table_schema = 'cabinet_dealz' AND table_name = 'designer_subscriptions') AS tablePresent,
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema = 'cabinet_dealz' AND table_name = 'designer_subscriptions') AS columnsPresent,
  (SELECT COUNT(*) FROM cabinet_dealz.designer_subscriptions) AS rowCount;
