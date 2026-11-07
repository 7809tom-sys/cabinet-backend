-- Affiliate legal contracts and DocuSeal e-signatures.
-- File number 0269. BUMP THIS NUMBER AT MERGE if a sibling PR takes 0269 or
-- later; the number is only a paste order, nothing reads it.
--
-- Run after 0268. Paste ONE LINE at a time in the TiDB Cloud SQL editor: every
-- statement is on a single line by design, and every table is
-- cabinet_dealz.<table>. No IF NOT EXISTS anywhere, because TiDB Cloud rejects
-- it on ADD COLUMN and CREATE TABLE in some regions.
--
-- Not applied by the application, and never run by CI. Tom runs it by hand.
--
-- Safe to re-run, but not silent: on a second run a CREATE TABLE answers
-- "Table ... already exists" and a CREATE INDEX answers "Duplicate key name".
-- THAT ERROR IS SAFE: the object already exists, which is what the statement
-- wanted. Skip that one line and paste the next. No statement here is an
-- ALTER or an UPDATE, so a re-run cannot change or destroy existing data.
--
-- What this adds, and why each table exists:
--
--   affiliate_legal_documents          one row per contract an admin publishes
--                                      (title, slug, active, required-for-membership).
--                                      currentVersionId points at the version now
--                                      offered for signature.
--
--   affiliate_legal_document_versions  IMMUTABLE versions. Publishing an edit
--                                      inserts a new row; an old row is never
--                                      rewritten, so a signature always refers to
--                                      the exact text it was made against.
--                                      contentSha256 is the SHA-256 of those bytes.
--                                      docusealTemplateId is the DocuSeal template
--                                      built from that version; null means the
--                                      contract is not signable yet and the portal
--                                      says so instead of failing silently.
--
--   affiliate_legal_signing_sessions   one in-flight DocuSeal signing request per
--                                      affiliate and version, so a page reload
--                                      resumes it instead of filing a second one.
--
--   affiliate_legal_signatures         APPEND-ONLY evidence. Nothing in the
--                                      application updates or deletes these rows.
--                                      The two unique keys are what make a replayed
--                                      DocuSeal webhook harmless.
--
-- The storage keys in signedPdfKey / auditLogKey sit under
-- affiliate-legal-signatures/, which the backend keeps in the private Supabase
-- bucket and refuses on the public storage proxy. The signed PDF and the audit
-- trail leave only through a short-lived signed URL issued to the affiliate who
-- signed or to an admin.

-- 1. Contracts.
CREATE TABLE cabinet_dealz.affiliate_legal_documents (id INT NOT NULL AUTO_INCREMENT, slug VARCHAR(80) NOT NULL, title VARCHAR(255) NOT NULL, summary VARCHAR(512) NULL, sortOrder INT NOT NULL DEFAULT 0, isActive TINYINT(1) NOT NULL DEFAULT 1, requiredForMembership TINYINT(1) NOT NULL DEFAULT 1, currentVersionId INT NULL, createdByUserId INT NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, PRIMARY KEY (id), UNIQUE KEY affiliate_legal_documents_slug_uq (slug)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Immutable versions of each contract.
CREATE TABLE cabinet_dealz.affiliate_legal_document_versions (id INT NOT NULL AUTO_INCREMENT, documentId INT NOT NULL, version INT NOT NULL, title VARCHAR(255) NOT NULL, kind VARCHAR(16) NOT NULL DEFAULT 'markdown', bodyMarkdown MEDIUMTEXT NULL, fileKey VARCHAR(512) NULL, filename VARCHAR(255) NULL, mimeType VARCHAR(128) NULL, sizeBytes INT NULL, contentSha256 VARCHAR(64) NOT NULL, docusealTemplateId INT NULL, publishedAt TIMESTAMP NULL DEFAULT NULL, createdByUserId INT NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (id), UNIQUE KEY affiliate_legal_document_versions_doc_version_uq (documentId, version), KEY affiliate_legal_document_versions_document_idx (documentId)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. In-flight DocuSeal signing requests.
CREATE TABLE cabinet_dealz.affiliate_legal_signing_sessions (id INT NOT NULL AUTO_INCREMENT, affiliateId INT NOT NULL, documentId INT NOT NULL, documentVersionId INT NOT NULL, provider VARCHAR(16) NOT NULL DEFAULT 'docuseal', providerSubmissionId VARCHAR(64) NULL, providerSubmitterId VARCHAR(64) NULL, status VARCHAR(16) NOT NULL DEFAULT 'pending', createdByUserId INT NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, PRIMARY KEY (id), KEY affiliate_legal_signing_sessions_affiliate_version_idx (affiliateId, documentVersionId), KEY affiliate_legal_signing_sessions_submission_idx (providerSubmissionId), KEY affiliate_legal_signing_sessions_status_idx (status)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Append-only signature evidence. One row per affiliate per document version.
CREATE TABLE cabinet_dealz.affiliate_legal_signatures (id INT NOT NULL AUTO_INCREMENT, affiliateId INT NOT NULL, userId INT NULL, documentId INT NOT NULL, documentVersionId INT NOT NULL, documentSlug VARCHAR(80) NOT NULL, documentVersion INT NOT NULL, documentTitle VARCHAR(255) NOT NULL, contentSha256 VARCHAR(64) NOT NULL, provider VARCHAR(16) NOT NULL DEFAULT 'docuseal', providerSubmissionId VARCHAR(64) NOT NULL, providerSubmitterId VARCHAR(64) NULL, providerEventId VARCHAR(128) NULL, signerName VARCHAR(255) NULL, signerEmail VARCHAR(320) NULL, signerIp VARCHAR(64) NULL, signerUserAgent VARCHAR(512) NULL, providerAuditLogUrl VARCHAR(1024) NULL, signedPdfKey VARCHAR(512) NULL, auditLogKey VARCHAR(512) NULL, completedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (id), UNIQUE KEY affiliate_legal_signatures_affiliate_version_uq (affiliateId, documentVersionId), UNIQUE KEY affiliate_legal_signatures_event_uq (providerEventId), KEY affiliate_legal_signatures_affiliate_idx (affiliateId), KEY affiliate_legal_signatures_version_idx (documentVersionId)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. VERIFY the four tables exist before going further. Expect four rows.
SELECT table_name AS createdTable FROM information_schema.tables WHERE table_schema = 'cabinet_dealz' AND table_name IN ('affiliate_legal_documents', 'affiliate_legal_document_versions', 'affiliate_legal_signing_sessions', 'affiliate_legal_signatures') ORDER BY table_name;

-- 6. VERIFY the append-only guarantees are really in place. Expect two rows, both uniqueKey = 1, with the columns shown.
SELECT index_name AS indexName, non_unique AS notUnique, GROUP_CONCAT(column_name ORDER BY seq_in_index) AS columnsCovered FROM information_schema.statistics WHERE table_schema = 'cabinet_dealz' AND table_name = 'affiliate_legal_signatures' AND index_name IN ('affiliate_legal_signatures_affiliate_version_uq', 'affiliate_legal_signatures_event_uq') GROUP BY index_name, non_unique ORDER BY index_name;

-- 7. VERIFY nothing was published yet: an empty list means no contract is
--    required, so the onboarding gate passes on day one. Publish contracts in
--    the admin panel; do not insert them here.
SELECT id AS legalDocumentId, slug, title, isActive, requiredForMembership, currentVersionId FROM cabinet_dealz.affiliate_legal_documents ORDER BY sortOrder, id;

-- 8. Read-only: signatures already on record. Empty on a fresh install.
SELECT id AS signatureId, affiliateId, documentSlug, documentVersion, signerName, signerEmail, completedAt, signedPdfKey IS NOT NULL AS hasSignedPdf, auditLogKey IS NOT NULL AS hasAuditLog FROM cabinet_dealz.affiliate_legal_signatures ORDER BY completedAt DESC LIMIT 50;
