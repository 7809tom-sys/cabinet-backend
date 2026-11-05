-- Migration 0234. Journal idx 233, when 1795500000000. It follows
-- 0233_order_pallet_photo, the last entry in the journal.
-- TiDB SQL editor statements are in docs/sql/0248_vendor_email_purposes.tidb.sql.
--
-- Creates four new tables and inserts nothing. No existing table is altered, so
-- a supplier's own settings are never rewritten by this migration.
CREATE TABLE IF NOT EXISTS `vendor_email_addresses` (
  `id` int AUTO_INCREMENT NOT NULL,
  `distributorId` int NOT NULL,
  `purpose` enum('claims','support','sales','sales_communication') NOT NULL,
  `address` varchar(320) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `vendor_email_addresses_id` PRIMARY KEY(`id`),
  CONSTRAINT `vendor_email_addresses_vendor_purpose_uq` UNIQUE(`distributorId`,`purpose`),
  KEY `vendor_email_addresses_address_idx` (`address`)
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `vendor_email_routes` (
  `id` int AUTO_INCREMENT NOT NULL,
  `purpose` enum('claims','support','sales','sales_communication') NOT NULL,
  `recipientEmail` varchar(320) NOT NULL DEFAULT '',
  `recipientName` varchar(128) NOT NULL DEFAULT '',
  `assigneeUserId` int,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `vendor_email_routes_id` PRIMARY KEY(`id`),
  CONSTRAINT `vendor_email_routes_purpose_uq` UNIQUE(`purpose`)
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `vendor_inbound_emails` (
  `id` int AUTO_INCREMENT NOT NULL,
  `providerMessageId` varchar(256) NOT NULL,
  `distributorId` int,
  `purpose` enum('claims','support','sales','sales_communication'),
  `matchedAddress` varchar(320),
  `fromEmail` varchar(320) NOT NULL,
  `fromName` varchar(256),
  `toEmails` varchar(1024),
  `ccEmails` varchar(1024),
  `subject` varchar(512) NOT NULL DEFAULT '',
  `textBody` text,
  `htmlBody` text,
  `routedToEmail` varchar(320),
  `routedToUserId` int,
  `status` enum('received','forwarded','dismissed') NOT NULL DEFAULT 'received',
  `forwardedAt` timestamp NULL,
  `forwardedTo` varchar(1024),
  `forwardedByUserId` int,
  `receivedAt` timestamp NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `vendor_inbound_emails_id` PRIMARY KEY(`id`),
  CONSTRAINT `vendor_inbound_emails_provider_msg_uq` UNIQUE(`providerMessageId`),
  KEY `vendor_inbound_emails_vendor_idx` (`distributorId`),
  KEY `vendor_inbound_emails_purpose_idx` (`purpose`),
  KEY `vendor_inbound_emails_status_idx` (`status`)
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `vendor_email_forwards` (
  `id` int AUTO_INCREMENT NOT NULL,
  `inboundEmailId` int NOT NULL,
  `toEmails` varchar(1024) NOT NULL,
  `note` varchar(1024),
  `sentByUserId` int,
  `sentByName` varchar(256),
  `status` enum('sent','failed') NOT NULL,
  `error` varchar(1024),
  `fromEmail` varchar(320),
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `vendor_email_forwards_id` PRIMARY KEY(`id`),
  KEY `vendor_email_forwards_email_idx` (`inboundEmailId`)
);
