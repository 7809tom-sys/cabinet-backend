-- TiDB SQL editor version. Numbered 0248. Run after 0247.
-- Paste each numbered block on its own. One statement per block.
-- Every table is cabinet_dealz.<table>. No reserved-word aliases.
-- Safe to re-run: CREATE TABLE IF NOT EXISTS only.
--
-- This file creates four new tables and inserts nothing. It does not update or
-- delete any existing row, and it never touches distributors, products, orders,
-- affiliate settings, or distributor settings.
--
-- Why: a supplier publishes separate addresses for claims, support, sales, and
-- sales communication. Mail arriving on those addresses is stored here, tagged
-- with the vendor and the purpose, and queued to the Cabinet Dealz staff inbox
-- that owns that purpose.
--
-- Nothing is forwarded when a message arrives. Forwarding is an explicit admin
-- action and is recorded in vendor_email_forwards.

-- 1. The four addresses per vendor. One row per (vendor, purpose).
CREATE TABLE IF NOT EXISTS cabinet_dealz.vendor_email_addresses (
  id INT NOT NULL AUTO_INCREMENT,
  distributorId INT NOT NULL,
  purpose ENUM('claims','support','sales','sales_communication') NOT NULL,
  address VARCHAR(320) NOT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY vendor_email_addresses_vendor_purpose_uq (distributorId, purpose),
  KEY vendor_email_addresses_address_idx (address)
);

-- 2. Which internal inbox owns each purpose. Empty address = unassigned.
CREATE TABLE IF NOT EXISTS cabinet_dealz.vendor_email_routes (
  id INT NOT NULL AUTO_INCREMENT,
  purpose ENUM('claims','support','sales','sales_communication') NOT NULL,
  recipientEmail VARCHAR(320) NOT NULL DEFAULT '',
  recipientName VARCHAR(128) NOT NULL DEFAULT '',
  assigneeUserId INT NULL,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY vendor_email_routes_purpose_uq (purpose)
);

-- 3. Accepted inbound messages. providerMessageId is unique so a retried
--    webhook cannot store the same message twice.
CREATE TABLE IF NOT EXISTS cabinet_dealz.vendor_inbound_emails (
  id INT NOT NULL AUTO_INCREMENT,
  providerMessageId VARCHAR(256) NOT NULL,
  distributorId INT NULL,
  purpose ENUM('claims','support','sales','sales_communication') NULL,
  matchedAddress VARCHAR(320) NULL,
  fromEmail VARCHAR(320) NOT NULL,
  fromName VARCHAR(256) NULL,
  toEmails VARCHAR(1024) NULL,
  ccEmails VARCHAR(1024) NULL,
  subject VARCHAR(512) NOT NULL DEFAULT '',
  textBody TEXT NULL,
  htmlBody TEXT NULL,
  routedToEmail VARCHAR(320) NULL,
  routedToUserId INT NULL,
  status ENUM('received','forwarded','dismissed') NOT NULL DEFAULT 'received',
  forwardedAt TIMESTAMP NULL,
  forwardedTo VARCHAR(1024) NULL,
  forwardedByUserId INT NULL,
  receivedAt TIMESTAMP NOT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY vendor_inbound_emails_provider_msg_uq (providerMessageId),
  KEY vendor_inbound_emails_vendor_idx (distributorId),
  KEY vendor_inbound_emails_purpose_idx (purpose),
  KEY vendor_inbound_emails_status_idx (status)
);

-- 4. One row per explicit admin forward, successful or failed.
CREATE TABLE IF NOT EXISTS cabinet_dealz.vendor_email_forwards (
  id INT NOT NULL AUTO_INCREMENT,
  inboundEmailId INT NOT NULL,
  toEmails VARCHAR(1024) NOT NULL,
  note VARCHAR(1024) NULL,
  sentByUserId INT NULL,
  sentByName VARCHAR(256) NULL,
  status ENUM('sent','failed') NOT NULL,
  error VARCHAR(1024) NULL,
  fromEmail VARCHAR(320) NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY vendor_email_forwards_email_idx (inboundEmailId)
);

-- 5 read-only check. Expect 4.
SELECT COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = 'cabinet_dealz'
    AND TABLE_NAME IN (
      'vendor_email_addresses',
      'vendor_email_routes',
      'vendor_inbound_emails',
      'vendor_email_forwards'
    );
