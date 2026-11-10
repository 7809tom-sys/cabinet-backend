-- TiDB SQL editor version. Numbered 0273. Run after 0272.
-- One statement per line, so each line pastes on its own in the TiDB Cloud
-- editor. Every table is cabinet_dealz.<table>.
-- Do not run this from the application. Tom pastes it by hand.
--
-- NUMBER: 0273 is the next free number on main as this branch was opened.
-- Sibling feature branches may claim 0273 first. If so, only the file number
-- changes on rebase; the statements do not.
--
-- This file is additive. It creates Job Boarding tables and does not alter
-- any table that already exists. Deploying the backend before pasting this
-- file is safe for every other screen: the new procedures catch a missing
-- table and do not lock existing sales reps until the tables are present.
-- Once this file has been pasted, a sales_rep must finish all four steps
-- before CRM, commissions, and the designer open for them.
--
-- TiDB Cloud rejects "CREATE TABLE IF NOT EXISTS" in the editor, so each
-- CREATE is plain. On a re-run it answers "Table ... already exists".
-- THAT ERROR IS SAFE: skip that line and paste the next one. The same is
-- true of "Duplicate key name" on an index and "Duplicate entry" on the
-- placeholder seed.
--
-- What is stored, and what is not:
--   salesperson_w9.tinEnvelope   AES-GCM envelope. Never a plaintext SSN/EIN.
--                                The key is the server env var
--                                W9_TAX_ID_ENCRYPTION_KEY. Only tinLast4
--                                (four digits) is displayable.
--   salesperson_identity_documents.storageKey
--                                object key in the private bucket, under
--                                salesperson-identity/. There is no url
--                                column. Bytes are reachable only through a
--                                short-lived signed URL issued to an admin.
--   salesperson_legal_documents  the non-compete. termYears defaults to 2
--                                and is metadata shown on the signing step.
--                                The seeded body is a placeholder, not a
--                                contract. An admin replaces it by inserting
--                                the next version.
--
-- The placeholder body, exactly:
--   Two-year non-compete — final text pending from Tom or his attorney

-- 1. One onboarding row per salesperson account.
CREATE TABLE cabinet_dealz.salesperson_onboarding (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, userId INT NOT NULL, fullName VARCHAR(256) NULL, email VARCHAR(320) NULL, phone VARCHAR(32) NULL, businessName VARCHAR(256) NULL, licenseNumber VARCHAR(64) NULL, address1 VARCHAR(256) NULL, address2 VARCHAR(256) NULL, city VARCHAR(128) NULL, state VARCHAR(64) NULL, postalCode VARCHAR(16) NULL, informationCompletedAt DATETIME NULL, verifiedAt DATETIME NULL, activatedAt DATETIME NULL, verificationTokenHash VARCHAR(64) NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE KEY salesperson_onboarding_user_uq (userId), KEY salesperson_onboarding_token_idx (verificationTokenHash));

-- 2. The non-compete document. termYears is the configurable term (2).
CREATE TABLE cabinet_dealz.salesperson_legal_documents (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, slug VARCHAR(80) NOT NULL, title VARCHAR(255) NOT NULL, summary VARCHAR(512) NULL, termYears INT NOT NULL DEFAULT 2, isActive BOOLEAN NOT NULL DEFAULT 1, currentVersionId INT NULL, createdByUserId INT NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE KEY salesperson_legal_documents_slug_uq (slug));

-- 3. Immutable versions. A replacement is a new row, never an update of the body.
CREATE TABLE cabinet_dealz.salesperson_legal_document_versions (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, documentId INT NOT NULL, version INT NOT NULL, title VARCHAR(255) NOT NULL, termYears INT NOT NULL DEFAULT 2, kind ENUM('markdown','pdf') NOT NULL DEFAULT 'markdown', bodyMarkdown TEXT NULL, fileKey VARCHAR(512) NULL, filename VARCHAR(255) NULL, mimeType VARCHAR(128) NULL, sizeBytes INT NULL, contentSha256 VARCHAR(64) NOT NULL, docusealTemplateId INT NULL, publishedAt DATETIME NULL, createdByUserId INT NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY salesperson_legal_versions_doc_version_uq (documentId, version), KEY salesperson_legal_versions_document_idx (documentId));

-- 4. In-flight DocuSeal signing requests.
CREATE TABLE cabinet_dealz.salesperson_legal_signing_sessions (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, userId INT NOT NULL, documentId INT NOT NULL, documentVersionId INT NOT NULL, provider ENUM('docuseal') NOT NULL DEFAULT 'docuseal', providerSubmissionId VARCHAR(64) NULL, providerSubmitterId VARCHAR(64) NULL, status ENUM('pending','completed','declined','expired') NOT NULL DEFAULT 'pending', createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, KEY salesperson_legal_sessions_user_version_idx (userId, documentVersionId), KEY salesperson_legal_sessions_submission_idx (providerSubmissionId));

-- 5. Append-only signatures. providerEventId stops a replayed webhook inserting a second row.
CREATE TABLE cabinet_dealz.salesperson_legal_signatures (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, userId INT NOT NULL, documentId INT NOT NULL, documentVersionId INT NOT NULL, documentVersion INT NOT NULL, termYears INT NOT NULL, documentTitle VARCHAR(255) NOT NULL, contentSha256 VARCHAR(64) NOT NULL, provider ENUM('docuseal') NOT NULL DEFAULT 'docuseal', providerSubmissionId VARCHAR(64) NOT NULL, providerSubmitterId VARCHAR(64) NULL, providerEventId VARCHAR(128) NULL, signerName VARCHAR(255) NULL, signerEmail VARCHAR(320) NULL, signedPdfKey VARCHAR(512) NULL, auditLogKey VARCHAR(512) NULL, completedAt DATETIME NOT NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY salesperson_legal_signatures_user_version_uq (userId, documentVersionId), UNIQUE KEY salesperson_legal_signatures_event_uq (providerEventId), KEY salesperson_legal_signatures_user_idx (userId));

-- 6. W-9 fields. tinEnvelope is ciphertext. tinLast4 is the only readable fragment.
CREATE TABLE cabinet_dealz.salesperson_w9 (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, userId INT NOT NULL, legalName VARCHAR(256) NOT NULL, businessName VARCHAR(256) NULL, taxClassification ENUM('individual','c_corporation','s_corporation','partnership','trust_estate','llc','other') NOT NULL, llcClassification VARCHAR(8) NULL, address VARCHAR(256) NOT NULL, city VARCHAR(128) NOT NULL, state VARCHAR(64) NOT NULL, zip VARCHAR(16) NOT NULL, tinEnvelope VARCHAR(512) NOT NULL, tinLast4 VARCHAR(4) NOT NULL, tinType ENUM('ssn','ein') NOT NULL, signatureName VARCHAR(256) NOT NULL, signedOn VARCHAR(10) NOT NULL, submittedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE KEY salesperson_w9_user_uq (userId));

-- 7. Government ID files. storageKey only. No public URL.
CREATE TABLE cabinet_dealz.salesperson_identity_documents (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, userId INT NOT NULL, label ENUM('front','back','other') NOT NULL DEFAULT 'front', storageKey VARCHAR(512) NOT NULL, mimeType VARCHAR(128) NOT NULL, sizeBytes INT NOT NULL, originalName VARCHAR(255) NULL, supersededAt DATETIME NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, KEY salesperson_identity_user_idx (userId, supersededAt));

-- 8. Placeholder non-compete. "Duplicate entry" on a re-run is safe to skip.
INSERT INTO cabinet_dealz.salesperson_legal_documents (slug, title, summary, termYears, isActive) VALUES ('salesperson-non-compete', 'Salesperson non-compete', 'Placeholder until Tom or his attorney supplies the contract.', 2, 1);

-- 9. Version 1 of that placeholder. contentSha256 is SHA-256 of the placeholder body. "Duplicate entry" on a re-run is safe to skip.
INSERT INTO cabinet_dealz.salesperson_legal_document_versions (documentId, version, title, termYears, kind, bodyMarkdown, contentSha256, publishedAt) SELECT id, 1, 'Salesperson non-compete', 2, 'markdown', 'Two-year non-compete — final text pending from Tom or his attorney', '9a66bd437d4d64be0a1dffbbf7417e053e78533d9992a38330b9b602bae8af78', CURRENT_TIMESTAMP FROM cabinet_dealz.salesperson_legal_documents WHERE slug = 'salesperson-non-compete';

-- 10. Point the document at version 1. Safe to re-run: it only fills a null pointer.
UPDATE cabinet_dealz.salesperson_legal_documents d JOIN cabinet_dealz.salesperson_legal_document_versions v ON v.documentId = d.id AND v.version = 1 SET d.currentVersionId = v.id WHERE d.slug = 'salesperson-non-compete' AND d.currentVersionId IS NULL;

-- 11. VERIFY (read-only). Expect the placeholder version, term 2, and the hash above.
SELECT d.slug, d.termYears AS documentTermYears, d.currentVersionId, v.version, v.termYears AS versionTermYears, v.bodyMarkdown, v.contentSha256 FROM cabinet_dealz.salesperson_legal_documents d JOIN cabinet_dealz.salesperson_legal_document_versions v ON v.id = d.currentVersionId WHERE d.slug = 'salesperson-non-compete';

-- 12. VERIFY (read-only). No identity key may look like a public address. Expect zero rows.
SELECT id AS documentId, userId, storageKey FROM cabinet_dealz.salesperson_identity_documents WHERE storageKey NOT LIKE 'salesperson-identity/%' OR storageKey LIKE '%manus-storage%';

-- 13. VERIFY (read-only). No W-9 row may hold an unencrypted 9-digit TIN. Expect zero rows. An envelope starts with cabinetdealz:w9tax:v1:.
SELECT id AS w9Id, userId, tinLast4 FROM cabinet_dealz.salesperson_w9 WHERE tinEnvelope NOT LIKE 'cabinetdealz:w9tax:v1:%' OR tinEnvelope REGEXP '^[0-9]{9}$';
