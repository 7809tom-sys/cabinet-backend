-- TiDB SQL editor version. Numbered 0273. Run after 0272_affiliate_legal_esign.
-- One statement per line, so each line can be pasted on its own in the TiDB
-- Cloud editor. Every table is cabinet_dealz.<table>. No IF NOT EXISTS.
-- Do not run this from an application. The owner pastes it in the TiDB editor.
--
-- What this adds, and nothing else:
--
--   affiliate_literature.contentSha256     SHA-256 hex of the file bytes.
--                                          Null on every row that already
--                                          exists. New uploads fill it. It is
--                                          indexed, not UNIQUE: a unique index
--                                          would fail if two files already
--                                          share a hash, and this file does
--                                          not delete or merge those rows.
--                                          docs/sql/0274 lists them. The
--                                          server refuses a NEW upload whose
--                                          hash matches a row and points the
--                                          admin at that row.
--   affiliate_literature.durationSeconds   Length of a commercial when the
--                                          container says. Null for documents
--                                          and for videos whose length could
--                                          not be read.
--   affiliate_literature.archivedAt        Set when an admin archives a
--                                          commercial. The file in storage is
--                                          left where it is.
--   affiliate_literature.archivedBy        The admin account that archived it.
--   affiliate_literature_tags              Free-text tags on a library row.
--                                          tagKey is the lowercase tag, unique
--                                          per file, so "Kitchen" and "kitchen"
--                                          cannot both stick.
--   library_commercial_publishes           One row per commercial per channel
--                                          (youtube, facebook, instagram,
--                                          tiktok, x, linkedin). Status is
--                                          draft, queued, published, or failed.
--                                          Nothing in this table posts by
--                                          itself.
--
-- Commercials are rows in affiliate_literature with a video mime type. They
-- use the same private library-documents/ prefix the PowerPoints use. This
-- file does not change visibility, isPublished, or any existing row's bytes.
--
-- Safe to re-run, but not silent: a second run answers "Duplicate column name"
-- or "Table ... already exists" or "Duplicate key name". THAT ERROR IS SAFE:
-- the object already exists. Skip that line and paste the next. No statement
-- here is a DELETE, a DROP, or an UPDATE, so a re-run cannot remove a file
-- or rewrite a document.
--
-- Until this is pasted, commercial uploads answer that this file has not been
-- run, and document uploads still succeed but cannot be checked for a
-- duplicate. The admin library list keeps working either way.

-- 1. The content hash. Nullable, so every current document stays valid. Expect no error.
ALTER TABLE cabinet_dealz.affiliate_literature ADD COLUMN contentSha256 VARCHAR(64) NULL;

-- 2. Duration for a commercial. Null on documents. Expect no error.
ALTER TABLE cabinet_dealz.affiliate_literature ADD COLUMN durationSeconds INT NULL;

-- 3. When a commercial was archived. Null means it is still in the library. Expect no error.
ALTER TABLE cabinet_dealz.affiliate_literature ADD COLUMN archivedAt DATETIME NULL;

-- 4. Who archived it. Expect no error.
ALTER TABLE cabinet_dealz.affiliate_literature ADD COLUMN archivedBy INT NULL;

-- 5. Lookup index for the duplicate check. Not unique, on purpose. Expect no error.
ALTER TABLE cabinet_dealz.affiliate_literature ADD INDEX affiliate_literature_content_sha256_idx (contentSha256);

-- 6. Tags. A new table, so there is nothing to preview. Expect no error.
CREATE TABLE cabinet_dealz.affiliate_literature_tags (id INT NOT NULL AUTO_INCREMENT, literatureId INT NOT NULL, tag VARCHAR(40) NOT NULL, tagKey VARCHAR(40) NOT NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (id), UNIQUE KEY affiliate_literature_tags_literature_tag_uq (literatureId, tagKey), KEY affiliate_literature_tags_tag_key_idx (tagKey));

-- 7. Per-channel publish records. A new table. Expect no error. Publishing still requires an admin click after this exists; the table alone posts nothing.
CREATE TABLE cabinet_dealz.library_commercial_publishes (id INT NOT NULL AUTO_INCREMENT, literatureId INT NOT NULL, channel VARCHAR(32) NOT NULL, status VARCHAR(16) NOT NULL DEFAULT 'draft', externalPostId VARCHAR(255) NULL, externalPostUrl VARCHAR(1024) NULL, error TEXT NULL, publishedBy INT NULL, publishedAt DATETIME NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, PRIMARY KEY (id), UNIQUE KEY library_commercial_publishes_video_channel_uq (literatureId, channel), KEY library_commercial_publishes_status_idx (status));

-- 8. VERIFY (read-only). Expect four rows: contentSha256, durationSeconds, archivedAt, archivedBy.
SELECT COLUMN_NAME AS presentColumn, COLUMN_TYPE AS columnType, IS_NULLABLE AS nullable FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'cabinet_dealz' AND TABLE_NAME = 'affiliate_literature' AND COLUMN_NAME IN ('contentSha256', 'durationSeconds', 'archivedAt', 'archivedBy') ORDER BY COLUMN_NAME;

-- 9. VERIFY (read-only). Expect the new index name, and NON_UNIQUE = 1. A unique index would be 0, and this file does not create one.
SELECT INDEX_NAME AS indexName, NON_UNIQUE AS nonUnique, COLUMN_NAME AS columnName FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = 'cabinet_dealz' AND TABLE_NAME = 'affiliate_literature' AND INDEX_NAME = 'affiliate_literature_content_sha256_idx';

-- 10. VERIFY (read-only). Expect the tags table columns.
SELECT COLUMN_NAME AS presentColumn, COLUMN_TYPE AS columnType FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'cabinet_dealz' AND TABLE_NAME = 'affiliate_literature_tags' ORDER BY ORDINAL_POSITION;

-- 11. VERIFY (read-only). Expect the publish table columns.
SELECT COLUMN_NAME AS presentColumn, COLUMN_TYPE AS columnType FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'cabinet_dealz' AND TABLE_NAME = 'library_commercial_publishes' ORDER BY ORDINAL_POSITION;

-- 12. VERIFY (read-only). Expect zero tag rows and zero publish rows on day one. Commercials appear only after an admin uploads one.
SELECT (SELECT COUNT(*) FROM cabinet_dealz.affiliate_literature_tags) AS tagRows, (SELECT COUNT(*) FROM cabinet_dealz.library_commercial_publishes) AS publishRows;
