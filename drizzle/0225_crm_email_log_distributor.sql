-- CRM email log can record which distributor received a purchase-order email.
ALTER TABLE `crm_email_log` ADD `distributorId` int;
