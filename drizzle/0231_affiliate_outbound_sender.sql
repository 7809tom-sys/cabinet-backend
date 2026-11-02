-- Migration 0231. Journal idx 230, when 1795200000000. It follows
-- 0229_countertop_quote_affiliate and 0230_affiliate_custom_domain from
-- cabinet-backend PR 73, which take journal idx 228 and 229, so this file and
-- its journal entry must land AFTER that PR to keep a single ordered journal.
-- Additive only: extends affiliate_email_settings so each affiliate can send
-- customer mail from its own mailbox. Nothing here touches countertop_quotes or
-- affiliates.customDomain, so the two migrations are independent.
--
-- contactEmail      the affiliate's own customer-facing address; also the
--                   default recipient of the "send test email" check.
-- smtpSecure        implicit TLS (465) vs STARTTLS (587). Stored instead of
--                   inferred so a custom host on a non-standard port works.
-- invoiceCopyEmail  where Cabinet Dealz receives a copy of every invoice.
--                   Blank means the platform admin address from env.
-- lastTestError     the exact SMTP error from the last test, never a password.
ALTER TABLE `affiliate_email_settings`
	ADD COLUMN `contactEmail` varchar(320) NOT NULL DEFAULT '',
	ADD COLUMN `smtpSecure` boolean NOT NULL DEFAULT false,
	ADD COLUMN `invoiceCopyEmail` varchar(320) NOT NULL DEFAULT '',
	ADD COLUMN `lastTestError` varchar(1000);
--> statement-breakpoint
-- Existing rows keep their prior behavior: the mailbox address already saved
-- becomes the contact address so an already-connected store starts sending
-- customer mail from that address instead of a blank field.
UPDATE `affiliate_email_settings`
SET `contactEmail` = COALESCE(NULLIF(`smtpFrom`, ''), NULLIF(`smtpUser`, ''))
WHERE `contactEmail` = '';
--> statement-breakpoint
UPDATE `affiliate_email_settings`
SET `smtpSecure` = true
WHERE `smtpPort` = 465;
