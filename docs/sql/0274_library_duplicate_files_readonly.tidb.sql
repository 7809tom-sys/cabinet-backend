-- READ ONLY. Numbered 0274. The owner pastes this in the TiDB Cloud SQL editor.
-- Do not run it from an application. Every statement is a SELECT. There is no
-- INSERT, UPDATE, DELETE, ALTER, or DROP in the executable lines. It cannot
-- remove a duplicate; it only lists them so a person can decide.
--
-- The document library is cabinet_dealz.affiliate_literature. Files live in
-- the private Supabase bucket under the key stored in fileKey, prefix
-- library-documents/. That table holds affiliate documents, PowerPoints, and
-- (after docs/sql/0273) commercials. It has filename and sizeBytes today.
-- It does NOT have a content hash until 0273 is pasted. Section A works
-- before that. Section B reads contentSha256 and answers "Unknown column" if
-- 0273 has not been pasted. That error is safe: stop there, nothing was changed.
--
-- cabinet_dealz.affiliate_resources is a different store (the Marketing Hub).
-- It has filename and sizeBytes and no hash column. This file only lists it.
-- It does not add a hash there.
--
-- cabinet_dealz.media_images is the image library (label, url, sizeBytes) and
-- is not the document library. It is not queried here.
--
-- GROUP_CONCAT can truncate a very long id list. The counts are still exact.

-- A1. Same file name and same size in the document library. These are the likely duplicates before any hash exists. Expect zero rows if every name+size pair is unique.
SELECT filename AS fileName, sizeBytes, COUNT(*) AS copies, GROUP_CONCAT(id ORDER BY id) AS literatureIds, GROUP_CONCAT(title ORDER BY id SEPARATOR ' | ') AS titles FROM cabinet_dealz.affiliate_literature GROUP BY filename, sizeBytes HAVING COUNT(*) > 1 ORDER BY copies DESC, filename;

-- A2. Same file name, even when the sizes differ (a deck exported twice). Expect zero rows if every name is unique.
SELECT filename AS fileName, COUNT(*) AS copies, GROUP_CONCAT(id ORDER BY id) AS literatureIds, GROUP_CONCAT(sizeBytes ORDER BY id) AS sizes FROM cabinet_dealz.affiliate_literature GROUP BY filename HAVING COUNT(*) > 1 ORDER BY copies DESC, filename;

-- A3. Same file name and same size in the Marketing Hub file table. No hash is stored on this table. Expect zero rows if every name+size pair is unique.
SELECT filename AS fileName, sizeBytes, COUNT(*) AS copies, GROUP_CONCAT(id ORDER BY id) AS resourceIds, GROUP_CONCAT(title ORDER BY id SEPARATOR ' | ') AS titles FROM cabinet_dealz.affiliate_resources WHERE filename IS NOT NULL GROUP BY filename, sizeBytes HAVING COUNT(*) > 1 ORDER BY copies DESC, filename;

-- A4. How many library files have no hash yet. This statement needs contentSha256 from 0273. If it answers Unknown column, 0273 has not been pasted; stop. The rows are unchanged.
SELECT COUNT(*) AS filesMissingHash, SUM(CASE WHEN contentSha256 IS NULL OR contentSha256 = '' THEN 1 ELSE 0 END) AS nullHashes, SUM(CASE WHEN contentSha256 IS NOT NULL AND contentSha256 <> '' THEN 1 ELSE 0 END) AS hashedFiles FROM cabinet_dealz.affiliate_literature;

-- B1. Exact duplicates by content hash. Rows with a null hash are not in this result, so an empty result does not prove there are no duplicates until A4 shows nullHashes = 0. Expect zero rows when no two hashed files share bytes.
SELECT contentSha256 AS contentHash, COUNT(*) AS copies, GROUP_CONCAT(id ORDER BY id) AS literatureIds, GROUP_CONCAT(filename ORDER BY id SEPARATOR ' | ') AS filenames, GROUP_CONCAT(sizeBytes ORDER BY id) AS sizes FROM cabinet_dealz.affiliate_literature WHERE contentSha256 IS NOT NULL AND contentSha256 <> '' GROUP BY contentSha256 HAVING COUNT(*) > 1 ORDER BY copies DESC;

-- B2. The rows behind B1, one per file, so the owner can open them by id. Expect zero rows when B1 is empty.
SELECT id AS literatureId, title, filename, sizeBytes, mimeType, contentSha256 AS contentHash, fileKey FROM cabinet_dealz.affiliate_literature WHERE contentSha256 IN (SELECT contentSha256 FROM cabinet_dealz.affiliate_literature WHERE contentSha256 IS NOT NULL AND contentSha256 <> '' GROUP BY contentSha256 HAVING COUNT(*) > 1) ORDER BY contentSha256, id;
