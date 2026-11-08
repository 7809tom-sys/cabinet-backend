-- TiDB SQL editor version. Numbered 0269. Run after 0268.
-- One statement per line, so each line can be pasted on its own in the TiDB
-- editor. Every table is cabinet_dealz.<table>. No table aliases.
-- Do not run this from an application. Tom pastes it in the TiDB editor.
--
-- The affiliate free-use ledger. An affiliate store whose
-- affiliates.membershipStatus is not 'active' gets five design-tool uses in
-- total, counted together across saved designs, Auto Design runs, and photo
-- renders (shared/affiliateFreeUsage.ts). Paid (active) affiliates are
-- unlimited, admins are exempt, and people who are not an affiliate are never
-- counted.
--
-- A ledger of one row per spent use, not a count of existing designs, so
-- deleting a design does not hand the use back and nothing in kitchen_designs
-- can reset the cap.
--
-- Additive only: one new table. No existing table is altered, no existing row
-- is read, written, or deleted.
--
-- No IF NOT EXISTS, because TiDB's editor rejects it on CREATE TABLE. Statement
-- 1 therefore fails with "Table ... already exists" if this file already ran,
-- which is the signal to stop and skip the rest. Statements 2-5 are read-only.
--
-- Run order: 1, then 2 and 3 to confirm the table and its keys exist. Nothing
-- in the backend breaks before this runs: the cap stays off and says so in the
-- log until the table is there.

-- 1. CREATE. Run once. Fails if the table already exists.
CREATE TABLE cabinet_dealz.affiliate_free_usage (id INT NOT NULL AUTO_INCREMENT, affiliateId INT NOT NULL, kind ENUM('design','auto_design','photo_render') NOT NULL, refId INT NULL, userId INT NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (id), KEY affiliate_free_usage_affiliate_kind_idx (affiliateId, kind), KEY affiliate_free_usage_created_at_idx (createdAt)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. VERIFY (read-only). Expect one row, with all six columns. A missing "kind" means statement 1 did not run.
SELECT COLUMN_NAME AS columnName, COLUMN_TYPE AS columnType, IS_NULLABLE AS nullable, COLUMN_DEFAULT AS columnDefault FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'cabinet_dealz' AND TABLE_NAME = 'affiliate_free_usage' ORDER BY ORDINAL_POSITION;

-- 3. VERIFY (read-only). Expect both indexes.
SELECT INDEX_NAME AS indexName, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columnsInIndex FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = 'cabinet_dealz' AND TABLE_NAME = 'affiliate_free_usage' GROUP BY INDEX_NAME ORDER BY INDEX_NAME;

-- 4. VERIFY (read-only). Expect zero rows on a fresh install. Any row here is an already-spent free use.
SELECT id AS usageId, affiliateId, kind, refId, userId, createdAt FROM cabinet_dealz.affiliate_free_usage ORDER BY id;

-- 5. VERIFY (read-only). Who is currently capped: affiliates without an active membership. Informational only; this file changes none of them.
SELECT id AS affiliateId, storeName, membershipStatus FROM cabinet_dealz.affiliates WHERE membershipStatus <> 'active' ORDER BY id;
