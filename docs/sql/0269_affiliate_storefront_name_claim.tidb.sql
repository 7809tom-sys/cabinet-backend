-- TiDB SQL editor version. Numbered 0269. Run after 0268.
-- One statement per line, so each line can be pasted on its own in the TiDB
-- editor. Every table is cabinet_dealz.<table>. No reserved-word aliases, and no
-- "IF NOT EXISTS" anywhere: TiDB Cloud rejects it here.
-- Do not run this from an application. Tom pastes it in the TiDB editor.
--
-- Feature: final affiliate onboarding step, where the affiliate types their
-- website name and the store goes live at /store/<slug>.
--
-- This file adds ONE new table and changes nothing that exists. It does not touch
-- affiliates, so no slug, store name, or storefront toggle is rewritten here, and
-- no affiliate is published by running it. Rows appear only when an affiliate
-- claims a name in the portal.
--
-- Why a new table instead of columns on affiliates:
--
--   affiliates.slug is the live public address. It has to stay editable by an
--   admin (a typo, a rebrand, a legal request). The claim record is the audit
--   trail of what the affiliate chose themselves, so the two are separate:
--
--     claimedSlug      the slug exactly as claimed. When it differs from
--                      affiliates.slug, an admin renamed the store afterwards.
--     claimedByName    the name the affiliate typed, before slugify().
--     claimedByUserId  the account that claimed it.
--     claimedAt        when the storefront went live.
--
--   affiliates is read on nearly every storefront request, so the audit columns
--   are kept off that row.
--
-- affiliateId is UNIQUE: one claim per affiliate. The server refuses a second
-- claim, so a claimed slug cannot move without an admin, even if two browser tabs
-- submit. claimedSlug is only indexed, not unique: an admin who renames a store
-- releases the old slug, and another affiliate must be able to claim it.
--
-- Safe to re-run, but not silent about it: statement 1 is a PLAIN CREATE TABLE.
-- A second run answers "Table 'affiliate_storefront_claims' already exists".
-- THAT ERROR IS SAFE: the table already exists, which is what statement 1
-- wanted. Skip that one line and paste the next.
--
-- Deploy order: run statements 1-2 first, then deploy the backend. The backend
-- reads this table on the affiliate's onboarding screen. Until it exists, that
-- screen answers "Storefront publishing is not set up yet" and refuses claims.
-- Nothing else on the storefront breaks, because every other read still uses
-- affiliates.slug.
--
-- Rollback: DROP TABLE cabinet_dealz.affiliate_storefront_claims. Every live
-- storefront keeps working, because the public storefront is resolved from
-- affiliates.slug and never from this table. What is lost is the record of which
-- slugs affiliates claimed themselves, so an admin rename stops being
-- distinguishable from the affiliate's own choice.

-- 1. The claim table. It is new, so there is nothing to preview. Expect no error.
CREATE TABLE cabinet_dealz.affiliate_storefront_claims (id INT NOT NULL AUTO_INCREMENT, affiliateId INT NOT NULL, claimedSlug VARCHAR(64) NOT NULL, claimedByName VARCHAR(256) NULL, claimedByUserId INT NULL, claimedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (id), UNIQUE KEY affiliate_storefront_claims_affiliate_uq (affiliateId), KEY affiliate_storefront_claims_slug_idx (claimedSlug));

-- 2. VERIFY (read-only). Expect six rows, in this order: id, affiliateId, claimedSlug, claimedByName, claimedByUserId, claimedAt.
SELECT COLUMN_NAME AS presentColumn, COLUMN_TYPE AS columnType, IS_NULLABLE AS nullable FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'cabinet_dealz' AND TABLE_NAME = 'affiliate_storefront_claims' ORDER BY ORDINAL_POSITION;

-- 3. VERIFY (read-only). Expect the primary key plus the two named keys, and NON_UNIQUE = 0 only on affiliateId.
SELECT INDEX_NAME AS indexName, NON_UNIQUE AS nonUnique, COLUMN_NAME AS columnName FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = 'cabinet_dealz' AND TABLE_NAME = 'affiliate_storefront_claims' ORDER BY INDEX_NAME, SEQ_IN_INDEX;

-- 4. VERIFY (read-only). Expect zero rows on day one. Each later row is one affiliate whose storefront name was claimed in the portal.
SELECT id AS claimId, affiliateId, claimedSlug, claimedByName, claimedByUserId, claimedAt FROM cabinet_dealz.affiliate_storefront_claims ORDER BY claimedAt, id;

-- 5. VERIFY (read-only). Cross-check: claims whose slug no longer matches the live store, meaning an admin renamed the storefront after the claim. Read-only; nothing is corrected here.
SELECT affiliate_storefront_claims.affiliateId AS affiliateId, affiliate_storefront_claims.claimedSlug AS claimedSlug, affiliates.slug AS liveSlug, affiliates.storeName AS storeName, affiliates.storefrontEnabled AS storefrontEnabled, affiliate_storefront_claims.claimedAt AS claimedAt FROM cabinet_dealz.affiliate_storefront_claims INNER JOIN cabinet_dealz.affiliates ON affiliates.id = affiliate_storefront_claims.affiliateId WHERE affiliates.slug <> affiliate_storefront_claims.claimedSlug ORDER BY affiliate_storefront_claims.claimedAt;
