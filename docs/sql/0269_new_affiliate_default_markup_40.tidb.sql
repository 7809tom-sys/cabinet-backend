-- Feature 5 of 6: new affiliates start at a 40% markup on everything.
-- Numbered 0269. Run after 0268.
-- One statement per line, so each line can be pasted on its own in the TiDB
-- SQL editor. Every table is cabinet_dealz.<table>. No table aliases.
-- Do not run this from an application. Tom pastes it in the TiDB editor.
--
-- These two statements change the column DEFAULT only. They never touch a row
-- that already exists, so every current affiliate keeps the markup it has now
-- (Reaves Way stays at 55%, First Class stays at 20%, hardware at 0%).
-- Only affiliates created after this runs start at 40 / 40.
--
-- 4000 = 40% in basis points. Both columns are INT NOT NULL, so the default
-- applies to future INSERTs that do not name the column. The application also
-- sets both values explicitly on every affiliate it creates, so the two stay
-- in step. Non-affiliate customer pricing is not involved: this table only
-- carries each affiliate's own resale markup.
--
-- Safe to re-run: setting the same default twice is a no-op, and no row data
-- is read or written.

-- 1
ALTER TABLE cabinet_dealz.affiliates ALTER COLUMN defaultMarkupBps SET DEFAULT 4000;

-- 2
ALTER TABLE cabinet_dealz.affiliates ALTER COLUMN hardwareMarkupBps SET DEFAULT 4000;
