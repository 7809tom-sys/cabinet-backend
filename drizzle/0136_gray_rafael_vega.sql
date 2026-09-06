ALTER TABLE `crm_deals` MODIFY COLUMN `stage` enum('new','contacted','qualified','image_review','quoted','won','lost') NOT NULL DEFAULT 'new';--> statement-breakpoint
ALTER TABLE `crm_deals` MODIFY COLUMN `source` enum('manual','order_request','pro_application','storefront','referral','verified_plan_image_request') NOT NULL DEFAULT 'manual';--> statement-breakpoint
ALTER TABLE `design_image_requests` ADD `crmDealId` int;--> statement-breakpoint
CREATE INDEX `design_image_requests_crm_deal_idx` ON `design_image_requests` (`crmDealId`);