-- Migration 0229. Journal idx 228, when 1795000000000, immediately after
-- 0228_designer_offer_all. Additive only: extends affiliate_email_settings so
-- each affiliate can send customer mail from its own mailbox.
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
