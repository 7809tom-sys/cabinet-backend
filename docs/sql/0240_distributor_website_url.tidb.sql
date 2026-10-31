-- Optional supplier website on each distributor, shown read-only in Admin > Distributors.
-- Numbered 0240. Run after 0239 and BEFORE deploying this release: the admin list selects websiteUrl, so it errors until the column exists.
-- Paste each numbered block on its own in the TiDB SQL editor.
-- One statement per block. Do not paste this into an automatic migration.
-- Every table is cabinet_dealz.<table>. No reserved-word aliases.
-- Safe to re-run: IF NOT EXISTS and IS NULL guards.

-- 1
ALTER TABLE cabinet_dealz.distributors
  ADD COLUMN IF NOT EXISTS websiteUrl VARCHAR(512) NULL;

-- 2
-- DL Cabinetry only. Does nothing until the DL row exists (dl_distributor_setup_tidb.sql), and never overwrites a saved value.
UPDATE cabinet_dealz.distributors
SET websiteUrl = 'https://www.dlcabinetry.com'
WHERE code = 'DL' AND websiteUrl IS NULL;
