-- Migration 0229. Journal idx 228, when 1795000000000.
-- countertop_quotes.affiliateId
--
-- Countertop quote requests were platform-wide. Every storefront's admin list
-- showed every store's quote, including the customer contact details typed into
-- another affiliate's designer.
--
-- Nullable on purpose: NULL is the Cabinet Dealz house store, the same meaning
-- kitchen_designs.affiliateId already has. Existing rows are left NULL rather
-- than guessed, because a countertop quote carries no design or deal link that
-- would prove which storefront it came from.
--
-- Railway start (`pnpm start` / railway.json) does not run drizzle migrations.
-- Apply this file manually before deploying the scoped countertop reads, the
-- same way drizzle/0215_consultation_affiliate.sql was applied.
ALTER TABLE `countertop_quotes` ADD `affiliateId` int;--> statement-breakpoint
CREATE INDEX `countertop_quotes_affiliate_idx` ON `countertop_quotes` (`affiliateId`);
