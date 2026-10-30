-- Affiliate markup over the affiliate's cost for contractors that affiliate submitted.
-- Numbered 0238. Run after 0237 and before deploying.
-- Paste each numbered block on its own in the TiDB SQL editor.
-- One statement per block. Do not paste this into an automatic migration.
-- Every table is cabinet_dealz.<table>. No reserved-word aliases.
-- Safe to re-run: CREATE TABLE IF NOT EXISTS.
--
-- markupBps is percent over the affiliate's cost in basis points (100 bps = 1.00%).
-- 2900 means +29.00% and the contractor price is the affiliate's cost x (1 + 2900/10000).
-- That cost is the submitting store's tier, the platform affiliate markup, or the
-- flooring/appliance 40/60 split. It is not Cabinet Dealz cost.
-- A missing row means that affiliate's contractors use the site-wide
-- contractor multiplier on Cabinet Dealz cost
-- (pricing_settings.contractorMarkupBps / 10000).
-- Contractor labor estimates, kitchen rate defaults, and CRM ownership
-- already live in docs/sql/0234_contractor_portal.tidb.sql.

-- 1
CREATE TABLE IF NOT EXISTS cabinet_dealz.affiliate_contractor_markups (
  affiliateUserId INT NOT NULL PRIMARY KEY,
  markupBps INT NOT NULL,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updatedByUserId INT NULL
);
