-- TiDB SQL editor version. Numbered 0269. Run after 0268.
-- One statement per line, so each line can be pasted on its own in the TiDB
-- Cloud editor. Every table is cabinet_dealz.<table>. No table aliases, no
-- IF NOT EXISTS.
-- Do not run this from an application. The owner pastes it in the TiDB editor.
--
-- Why this file exists: 0255 has to be pasted by hand, and on 6 Nov 2026 it was
-- not pasted before the backend deploy that reads its columns. Every call to
-- affiliateLiterature.adminList answered HTTP 500 from 12:51 to 13:49 CT with
-- "Unknown column 'visibility' in 'field list'" and nothing in the runtime log
-- to say so. This file is the same four ALTERs, written so they can be run on
-- their own, and it is the file the backend now names in its log and in its
-- error message.
--
-- The backend no longer 500s without these columns: it reads the library
-- without them and treats every document as internal (admin only), which is the
-- documented default. Running this file turns the toggle and its audit trail on.
-- Until it runs, ticking "Affiliate library" answers PRECONDITION_FAILED with
-- this file's name instead of silently dropping the toggle.
--
-- Safe to re-run, but not silent about it: TiDB Cloud rejects
-- "ADD COLUMN IF NOT EXISTS", so these are PLAIN ALTERs. On a second run each
-- one answers "Duplicate column name ..." and creates nothing. THAT ERROR IS
-- SAFE: the column already exists, which is what the statement wanted. Skip that
-- line and paste the next.
--
-- Run the four ALTERs in order. Statement 1 must succeed first: statements 5 and
-- 6 read visibility, so they answer "Unknown column" until it exists.

-- 1. The visibility column. Internal is the default, so every document is admin-only for any row this file did not already backfill. This must succeed before any line below runs.
ALTER TABLE cabinet_dealz.affiliate_literature ADD COLUMN visibility VARCHAR(16) NOT NULL DEFAULT 'internal';

-- 2. When the "Affiliate library" checkbox was last changed. Null means never toggled.
ALTER TABLE cabinet_dealz.affiliate_literature ADD COLUMN affiliateToggledAt DATETIME NULL;

-- 3. Which admin account changed it. Null means never toggled, or the account was deleted.
ALTER TABLE cabinet_dealz.affiliate_literature ADD COLUMN affiliateToggledBy INT NULL;

-- 4. The admin's display name at the moment of the toggle, so the audit line survives a rename.
ALTER TABLE cabinet_dealz.affiliate_literature ADD COLUMN affiliateToggledByName VARCHAR(255) NULL;

-- 5. VERIFY (read-only). Expect exactly four rows, one per column this file adds. If you see fewer, the missing ALTER did not run.
SELECT column_name AS presentColumn, data_type AS columnType, is_nullable AS nullable, column_default AS defaultValue FROM information_schema.columns WHERE table_schema = 'cabinet_dealz' AND table_name = 'affiliate_literature' AND column_name IN ('visibility', 'affiliateToggledAt', 'affiliateToggledBy', 'affiliateToggledByName') ORDER BY column_name;

-- 6. VERIFY (read-only). Expect documentCount greater than zero; internalCount is how many documents the affiliate portal cannot see. This reads visibility, so it succeeds only if statement 1 worked.
SELECT COUNT(*) AS documentCount, SUM(CASE WHEN visibility = 'internal' THEN 1 ELSE 0 END) AS internalCount FROM cabinet_dealz.affiliate_literature;

-- 7. VERIFY (read-only). The library as the admin page now reads it. Every row here must match what you expect before you stop.
SELECT id AS literatureId, title, category, isPublished, visibility, affiliateToggledAt, affiliateToggledByName FROM cabinet_dealz.affiliate_literature ORDER BY sortOrder, id;

-- 8. VERIFY (read-only). Rows that were already published before the column existed, so they read 'internal' now and have dropped out of the affiliate portal. Statement 1's default cannot know they were affiliate-visible. Expect zero rows if 0255 already backfilled them. For each row this returns, tick "Affiliate library" on that document in the admin library; that writes visibility = 'affiliate' with your name and the time, which is the only correct way to re-publish it. This file never runs an UPDATE.
SELECT id AS literatureId, title, isPublished, visibility FROM cabinet_dealz.affiliate_literature WHERE visibility = 'internal' AND isPublished = 1 AND affiliateToggledAt IS NULL ORDER BY id;
