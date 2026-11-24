-- TiDB SQL editor version. Numbered 0286. Run after 0284.
-- (0285 is left free for the Pelican slab quote email branch.)
-- Paste each numbered block on its own. One statement per block.
-- Every table is cabinet_dealz.<table>.
--
-- What it does: adds SEVEN NEW tables for the admin CRM customer list import and
-- the AI follow-up outreach engine. Nothing existing is altered, updated or
-- deleted. crm_deals is NOT changed: an imported customer is an ordinary house
-- CRM contact (crm_deals row), and the import facts live in the new tables.
-- Block 8 is the only INSERT: it writes the single settings row with outreach
-- OFF and in preview mode. Block 9 is read-only.
--
-- Order is flexible. Until these run, the new admin Outreach tab shows
-- "run 0286 first" and the scheduler logs a warning and does nothing. The
-- existing CRM, the customer-list button affiliates use, and the designer
-- email form are unaffected either way.
--
-- Every block uses IF NOT EXISTS / INSERT IGNORE, so it is safe to run twice.

-- 1. One row per uploaded customer list (e.g. "New Hampshire legacy").
CREATE TABLE IF NOT EXISTS cabinet_dealz.crm_contact_imports (
  id INT NOT NULL AUTO_INCREMENT,
  sourceTag VARCHAR(128) NOT NULL,
  fileName VARCHAR(256) NOT NULL DEFAULT '',
  importedByUserId INT NULL,
  totalRows INT NOT NULL DEFAULT 0,
  importedCount INT NOT NULL DEFAULT 0,
  duplicateCount INT NOT NULL DEFAULT 0,
  skippedCount INT NOT NULL DEFAULT 0,
  status ENUM('running','finished') NOT NULL DEFAULT 'running',
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finishedAt TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id)
);

-- 2. One row per imported customer: source tag, import date and the legacy
--    columns crm_deals has no place for (street, city, state, ZIP, last purchase).
CREATE TABLE IF NOT EXISTS cabinet_dealz.crm_contact_import_rows (
  id INT NOT NULL AUTO_INCREMENT,
  importId INT NOT NULL,
  dealId INT NOT NULL,
  email VARCHAR(320) NOT NULL,
  sourceTag VARCHAR(128) NOT NULL,
  address VARCHAR(512) NULL,
  city VARCHAR(128) NULL,
  state VARCHAR(64) NULL,
  zip VARCHAR(16) NULL,
  lastPurchaseDate VARCHAR(32) NULL,
  importedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY crm_contact_import_rows_deal_uq (dealId),
  KEY crm_contact_import_rows_email_idx (email),
  KEY crm_contact_import_rows_tag_idx (sourceTag, importedAt)
);

-- 3. Outreach settings (single row, id = 1). Defaults: OFF, preview mode,
--    25 emails per day, at most 3 emails per contact.
CREATE TABLE IF NOT EXISTS cabinet_dealz.outreach_settings (
  id INT NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  mode ENUM('preview','approval','auto') NOT NULL DEFAULT 'preview',
  dailyCap INT NOT NULL DEFAULT 25,
  perContactCap INT NOT NULL DEFAULT 3,
  senderName VARCHAR(128) NOT NULL DEFAULT 'Tom at CabinetDealz',
  sequence JSON NULL,
  updatedByUserId INT NULL,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

-- 4. One sequence per contact. unsubscribeToken is the secret in the
--    unsubscribe and tracked links.
CREATE TABLE IF NOT EXISTS cabinet_dealz.outreach_enrollments (
  id INT NOT NULL AUTO_INCREMENT,
  dealId INT NOT NULL,
  email VARCHAR(320) NOT NULL,
  status ENUM('active','paused','completed','replied','unsubscribed','bounced','needs_owner','stopped') NOT NULL DEFAULT 'active',
  currentStep INT NOT NULL DEFAULT 0,
  nextSendAt TIMESTAMP NULL DEFAULT NULL,
  sentCount INT NOT NULL DEFAULT 0,
  lastSentAt TIMESTAMP NULL DEFAULT NULL,
  unsubscribeToken VARCHAR(64) NOT NULL,
  stopReason VARCHAR(256) NULL,
  lockedUntil TIMESTAMP NULL DEFAULT NULL,
  enrolledByUserId INT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY outreach_enrollments_deal_uq (dealId),
  UNIQUE KEY outreach_enrollments_token_uq (unsubscribeToken),
  KEY outreach_enrollments_email_idx (email),
  KEY outreach_enrollments_due_idx (status, nextSendAt)
);

-- 5. Every drafted email: preview log, approval queue and send log.
CREATE TABLE IF NOT EXISTS cabinet_dealz.outreach_messages (
  id INT NOT NULL AUTO_INCREMENT,
  enrollmentId INT NOT NULL,
  dealId INT NOT NULL,
  stepIndex INT NOT NULL,
  toEmail VARCHAR(320) NOT NULL,
  subject VARCHAR(256) NOT NULL,
  bodyText TEXT NOT NULL,
  draftSource ENUM('ai','fallback') NOT NULL DEFAULT 'ai',
  status ENUM('preview','pending_approval','approved','sending','sent','failed','rejected','skipped') NOT NULL,
  providerMessageId VARCHAR(256) NULL,
  transport VARCHAR(32) NULL,
  fromAddress VARCHAR(320) NULL,
  error VARCHAR(1000) NULL,
  approvedByUserId INT NULL,
  approvedAt TIMESTAMP NULL DEFAULT NULL,
  sentAt TIMESTAMP NULL DEFAULT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY outreach_messages_enrollment_idx (enrollmentId, stepIndex),
  KEY outreach_messages_status_idx (status, createdAt),
  KEY outreach_messages_sent_idx (sentAt),
  KEY outreach_messages_provider_idx (providerMessageId)
);

-- 6. Suppression list: addresses that never get outreach email (unsubscribed,
--     bounced, marked as spam, asked to stop, or added by hand).
CREATE TABLE IF NOT EXISTS cabinet_dealz.outreach_suppressions (
  id INT NOT NULL AUTO_INCREMENT,
  email VARCHAR(320) NOT NULL,
  reason ENUM('unsubscribe','bounce','complaint','manual','reply_stop') NOT NULL,
  source VARCHAR(128) NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY outreach_suppressions_email_uq (email)
);

-- 7. Append-only audit log of every send, failure, unsubscribe, bounce,
--     reply, click, approval and settings change.
CREATE TABLE IF NOT EXISTS cabinet_dealz.outreach_events (
  id INT NOT NULL AUTO_INCREMENT,
  eventType VARCHAR(48) NOT NULL,
  enrollmentId INT NULL,
  messageId INT NULL,
  dealId INT NULL,
  email VARCHAR(320) NULL,
  actorUserId INT NULL,
  detail JSON NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY outreach_events_type_idx (eventType, createdAt),
  KEY outreach_events_enrollment_idx (enrollmentId)
);

-- 8. The settings row, OFF and in preview mode. INSERT IGNORE never overwrites
--    a row that already exists.
INSERT IGNORE INTO cabinet_dealz.outreach_settings (id, enabled, mode, dailyCap, perContactCap, senderName, sequence)
VALUES (1, 0, 'preview', 25, 3, 'Tom at CabinetDealz', NULL);

-- 9. Read-only check: all seven tables exist and outreach is off.
SELECT
  (SELECT COUNT(*) FROM information_schema.tables
     WHERE table_schema = 'cabinet_dealz'
       AND table_name IN ('crm_contact_imports','crm_contact_import_rows','outreach_settings','outreach_enrollments','outreach_messages','outreach_suppressions','outreach_events')) AS tablesPresent,
  (SELECT enabled FROM cabinet_dealz.outreach_settings WHERE id = 1) AS outreachEnabled,
  (SELECT mode FROM cabinet_dealz.outreach_settings WHERE id = 1) AS outreachMode;
-- Expected: tablesPresent = 7, outreachEnabled = 0, outreachMode = preview.
