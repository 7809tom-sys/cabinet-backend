-- design_consultations.affiliateId
-- Reserved migration 0215 (one file). The journal tag is appended at the current
-- tip. Rebase that entry so it follows 0214 once earlier reserved migrations merge.
-- Do not renumber this file onto 0206.
-- Railway start (`pnpm start` / railway.json) does not run drizzle migrations.
-- Apply this file manually before deploying the scoped appointments query,
-- the same way drizzle/0205_stripe_payment_records.sql was applied.
-- This file was not executed against a database when it was added.
-- The UPDATEs below are the backfill. They set affiliateId only when a linked
-- design and CRM deal agree, or, when both of those are unset, when every
-- attributed design lead for the customer email names one affiliate.
ALTER TABLE `design_consultations` ADD `affiliateId` int;--> statement-breakpoint
CREATE INDEX `design_consultations_affiliate_idx` ON `design_consultations` (`affiliateId`);--> statement-breakpoint
UPDATE `design_consultations` c
LEFT JOIN `kitchen_designs` d ON d.id = c.designId
LEFT JOIN `crm_deals` deal ON deal.id = c.dealId
SET c.affiliateId = COALESCE(d.affiliateId, deal.affiliateId)
WHERE c.affiliateId IS NULL
  AND (d.affiliateId IS NOT NULL OR deal.affiliateId IS NOT NULL)
  AND (d.affiliateId IS NULL OR deal.affiliateId IS NULL OR d.affiliateId = deal.affiliateId);--> statement-breakpoint
UPDATE `design_consultations` c
LEFT JOIN `kitchen_designs` d ON d.id = c.designId
LEFT JOIN `crm_deals` deal ON deal.id = c.dealId
INNER JOIN (
  SELECT LOWER(email) AS emailKey, MIN(affiliateId) AS affiliateId
  FROM `design_leads`
  WHERE affiliateId IS NOT NULL
  GROUP BY LOWER(email)
  HAVING COUNT(DISTINCT affiliateId) = 1
) lead ON LOWER(c.customerEmail) = lead.emailKey
SET c.affiliateId = lead.affiliateId
WHERE c.affiliateId IS NULL
  AND d.affiliateId IS NULL
  AND deal.affiliateId IS NULL;
