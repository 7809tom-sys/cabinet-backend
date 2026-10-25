ALTER TABLE `pelican_shipping_profiles` ADD `evidenceType` enum('supplier_verified','comparable_estimate') DEFAULT 'supplier_verified' NOT NULL;--> statement-breakpoint
ALTER TABLE `pelican_shipping_profiles` ADD `comparisonRuleId` varchar(96);
