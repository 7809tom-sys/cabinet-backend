-- TiDB SQL editor version. Numbered 0269. Run after 0268.
-- One statement per line, so each line pastes on its own in the TiDB Cloud
-- editor. Every table is cabinet_dealz.<table>, with no aliases.
-- Do not run this from the application. Tom pastes it by hand.
--
-- NUMBER: 0269 is the next free number on main as this branch was opened, but
-- sibling feature branches are open in parallel and one of them may claim 0269
-- first. If so, only the file number changes on rebase; the statements do not.
--
-- This file is additive. It creates one table and adds no columns to anything
-- that already exists, so deploying the backend before pasting this file is
-- safe for every other screen: only the four affiliateDocuments.* procedures
-- touch the new table, and they fail with "table doesn't exist" until it runs.
--
-- TiDB Cloud rejects "CREATE TABLE IF NOT EXISTS" in the editor, so statement 1
-- is a plain CREATE TABLE. On a re-run it answers "Table ... already exists".
-- THAT ERROR IS SAFE: skip that line and paste the next one.
--
-- What the table holds and, more importantly, what it does not:
--
--   storageKey   the object key in the private Supabase bucket, under
--                affiliate-documents/. There is no url column: the bytes are
--                reachable only through a short-lived signed URL (5 minutes)
--                issued by a procedure that checked the row. /manus-storage/
--                affiliate-documents/... answers 403 for everyone, admins
--                included, so a forwarded path is worthless.
--   docType      driver_license, ssn_card, business_card, or reseller_certificate.
--                The first three are required for onboarding; the reseller
--                certificate is optional.
--   status       pending, approved, rejected. A new upload always starts pending.
--   reviewedAt   when a reviewer approved or rejected it. Null means unreviewed.
--   reviewedBy   the admin user id that decided. Null means unreviewed.
--   note         the reviewer's note, shown to the affiliate on a rejection.
--
-- Replace keeps history. A replacement upload inserts a new row and retires the
-- previous one with supersededAt + supersededByDocumentId, so the approved
-- document of record, who reviewed it, and when are never overwritten. Only
-- rows with supersededAt IS NULL count toward the onboarding gate.
--
-- No Social Security number, no tax id, and no file contents are stored here.
-- The encrypted W-9 tax id stays in affiliates.w9TaxId, unchanged.

-- 1. The table. One row per upload; a replace adds a row and retires the old one.
CREATE TABLE cabinet_dealz.affiliate_documents (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, affiliateId INT NOT NULL, docType ENUM('driver_license','ssn_card','business_card','reseller_certificate') NOT NULL, storageKey VARCHAR(512) NOT NULL, mimeType VARCHAR(128) NOT NULL, sizeBytes INT NOT NULL, originalName VARCHAR(255) NULL, status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending', reviewedAt DATETIME NULL, reviewedBy INT NULL, note TEXT NULL, uploadedBy INT NULL, supersededAt DATETIME NULL, supersededByDocumentId INT NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP);

-- 2. The affiliate's own read and the gate: affiliateId + docType, current rows only. "Duplicate key name" on a re-run is safe to skip.
CREATE INDEX affiliate_documents_affiliate_idx ON cabinet_dealz.affiliate_documents (affiliateId, docType, supersededAt);

-- 3. The admin review queue: status first, newest first. "Duplicate key name" on a re-run is safe to skip.
CREATE INDEX affiliate_documents_status_idx ON cabinet_dealz.affiliate_documents (status, createdAt);

-- 4. VERIFY (read-only). Expect exactly one row, all four columns present.
SELECT column_name AS presentColumn, data_type AS columnType, is_nullable AS nullable, column_default AS defaultValue FROM information_schema.columns WHERE table_schema = 'cabinet_dealz' AND table_name = 'affiliate_documents' ORDER BY ordinal_position;

-- 5. VERIFY (read-only). Expect zero before any affiliate uploads, then one per upload after.
SELECT COUNT(*) AS documentCount, SUM(CASE WHEN supersededAt IS NULL THEN 1 ELSE 0 END) AS currentCount, SUM(CASE WHEN status = 'pending' AND supersededAt IS NULL THEN 1 ELSE 0 END) AS pendingCount FROM cabinet_dealz.affiliate_documents;

-- 6. VERIFY (read-only). The onboarding gate for every store, in the same shape the backend computes: all three required documents must have an approved, current row. Every store should read 0 before launch.
SELECT a.id AS affiliateId, a.storeName, a.slug, SUM(CASE WHEN d.docType = 'driver_license' AND d.status = 'approved' AND d.supersededAt IS NULL THEN 1 ELSE 0 END) AS licenseApproved, SUM(CASE WHEN d.docType = 'ssn_card' AND d.status = 'approved' AND d.supersededAt IS NULL THEN 1 ELSE 0 END) AS ssnApproved, SUM(CASE WHEN d.docType = 'business_card' AND d.status = 'approved' AND d.supersededAt IS NULL THEN 1 ELSE 0 END) AS businessCardApproved FROM cabinet_dealz.affiliates a LEFT JOIN cabinet_dealz.affiliate_documents d ON d.affiliateId = a.id GROUP BY a.id, a.storeName, a.slug ORDER BY a.id;

-- 7. VERIFY (read-only). Nothing in this table may look like a public address. Expect zero rows; a row here means a key was written outside affiliate-documents/ and the backend will refuse to sign it.
SELECT id AS documentId, affiliateId, docType, storageKey FROM cabinet_dealz.affiliate_documents WHERE storageKey NOT LIKE 'affiliate-documents/%' OR storageKey LIKE '%manus-storage%';
