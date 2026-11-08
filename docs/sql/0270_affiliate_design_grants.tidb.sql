-- TiDB SQL editor version. Numbered 0270. Run after 0269.
-- One statement per line, so each line can be pasted on its own in the TiDB
-- editor. Every table is cabinet_dealz.<table>. No table aliases.
-- Do not run this from an application. Tom pastes it in the TiDB editor.
--
-- The admin "backdoor" design allowance. An admin can give one affiliate store
-- N extra design uses on top of the five free ones, and top it back up at any
-- time. A use draws from the free five first, then from this grant, and only
-- then is refused with MEMBERSHIP_REQUIRED.
--
-- designCount is stored explicitly on the grant, so the admin view and the
-- affiliate's own usage response can both report "Extra designs: 5 (3 left)".
-- Renewing resets usedSinceGrant to 0 and can change designCount, which is what
-- "top it back up" means. There is one grant row per store.
--
-- contactEmails is the comma-separated list of the emails the grant belongs to.
-- Statement 2 reads it from the affiliate's OWN row and never hardcodes an
-- email: affiliate_grants.email is the owner's sign-in email (NOT NULL), and
-- publicEmail is the storefront contact when the store set one. Anyone signed
-- in with one of those emails draws from the same grant.
--
-- Additive only. Statement 1 creates one new table. Statement 2 inserts one row
-- into that new table. Nothing is changed on cabinet_dealz.affiliates: no
-- UPDATE, no column, no status. Statements 3-7 are read-only checks.
--
-- No IF NOT EXISTS, because TiDB's editor rejects it on CREATE TABLE. Statement
-- 1 therefore fails with "Table ... already exists" if this file already ran,
-- which is the signal to stop and skip the rest. Statement 2 is guarded, so a
-- second run inserts nothing and changes nothing.
--
-- Run order: 1, then 2 (after reading statement 3), then 3-7 to confirm.
-- Nothing breaks before this runs: with no table the grant is ignored and the
-- free five apply exactly as they do today; with no row the store simply has no
-- extra designs yet.

-- 1. CREATE. Run once. Fails if the table already exists.
CREATE TABLE cabinet_dealz.affiliate_design_grants (id INT NOT NULL AUTO_INCREMENT, affiliateId INT NOT NULL, designCount INT NOT NULL DEFAULT 0, usedSinceGrant INT NOT NULL DEFAULT 0, contactEmails TEXT NULL, grantedBy VARCHAR(320) NULL, grantedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, renewedAt TIMESTAMP NULL, renewedBy VARCHAR(320) NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, PRIMARY KEY (id), UNIQUE KEY affiliate_design_grants_affiliate_uq (affiliateId)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. PREVIEW (read-only). Run this BEFORE statement 3. Shows affiliate 53 and the exact email values statement 3 will copy. Expect exactly one row, with both emails filled in (publicEmail is NULL when the store never set one).
SELECT id AS affiliateId, storeName, slug, email AS ownerEmail, publicEmail FROM cabinet_dealz.affiliates WHERE id = 53;

-- 3. INSERT the grant for affiliate 53: 5 extra designs, spent counter 0, contactEmails copied from affiliate 53's own row, grantedBy 'tom', grantedAt now. One row, one INSERT ... SELECT that reads only cabinet_dealz.affiliates where id = 53. INSERT IGNORE is the guard: affiliateId is UNIQUE, so re-running this inserts nothing and changes nothing. (A NOT EXISTS subquery would make the statement read its own target table, which TiDB rejects.)
INSERT IGNORE INTO cabinet_dealz.affiliate_design_grants (affiliateId, designCount, usedSinceGrant, contactEmails, grantedBy, grantedAt) SELECT 53, 5, 0, CONCAT_WS(',', NULLIF(LOWER(TRIM(email)), ''), NULLIF(LOWER(TRIM(publicEmail)), '')), 'tom', CURRENT_TIMESTAMP FROM cabinet_dealz.affiliates WHERE id = 53;

-- 4. VERIFY (read-only). Expect exactly one row: designCount 5, usedSinceGrant 0, so 5 left. contactEmails must match the two emails statement 2 showed.
SELECT id AS grantId, affiliateId, designCount, usedSinceGrant, designCount - usedSinceGrant AS remaining, contactEmails, grantedBy, grantedAt, renewedAt, renewedBy FROM cabinet_dealz.affiliate_design_grants WHERE affiliateId = 53;

-- 5. VERIFY (read-only). Expect both indexes: PRIMARY and affiliate_design_grants_affiliate_uq.
SELECT INDEX_NAME AS indexName, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columnsInIndex FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = 'cabinet_dealz' AND TABLE_NAME = 'affiliate_design_grants' GROUP BY INDEX_NAME ORDER BY INDEX_NAME;

-- 6. VERIFY (read-only). Affiliate 53 is otherwise untouched: still the same status, membership and store name. This file does not write to affiliates.
SELECT id AS affiliateId, storeName, status, membershipStatus, membershipExpiresAt, updatedAt FROM cabinet_dealz.affiliates WHERE id = 53;

-- 7. VERIFY (read-only). Every grant in the system, so a second store's grant is visible at a glance.
SELECT id AS grantId, affiliateId, designCount, usedSinceGrant, designCount - usedSinceGrant AS remaining, contactEmails, grantedBy, renewedBy FROM cabinet_dealz.affiliate_design_grants ORDER BY affiliateId;
