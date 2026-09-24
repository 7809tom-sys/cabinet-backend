ALTER TABLE `crm_deals` ADD `laborEstimateId` int;--> statement-breakpoint
ALTER TABLE `crm_deals` ADD CONSTRAINT `crm_deals_labor_estimate_fk` FOREIGN KEY (`laborEstimateId`) REFERENCES `affiliate_installation_estimates`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX `crm_deals_labor_estimate_idx` ON `crm_deals` (`laborEstimateId`);