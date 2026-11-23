-- Migration 0239. DO NOT RUN automatically. Hand this file to Tom to apply.
-- Journal idx would be 238, following 0238_affiliate_design_grants.
-- Numbering note: 0239 is the next free drizzle number on this branch. Other
-- open branches may take 0239 first, in which case this file must be
-- renumbered — nothing here depends on the number itself.
--
-- Adds a shipping-quote status on order_requests so an estimate or a manual
-- quote can be recorded without inventing a freight amount. Payment capture
-- is blocked only while status is awaiting_manual_shipping_quote. The
-- estimate path still lets the customer place or save the order.
-- Additive only: new nullable / defaulted columns. No existing row is deleted.

ALTER TABLE `order_requests`
  ADD `shippingQuoteStatus` enum('none','quoted','awaiting_shipping_estimate','awaiting_manual_shipping_quote')
    DEFAULT 'none' NOT NULL,
  ADD `shippingEstimateRequestedAt` timestamp NULL,
  ADD `manualShippingQuoteRequestedAt` timestamp NULL,
  ADD `pendingShippingCategories` varchar(255) NULL;
