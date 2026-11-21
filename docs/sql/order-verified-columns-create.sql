-- Order buttons column fix for TiDB cabinet_dealz (cluster prefix 4GBFngYGckRNTBc).
-- Taken verbatim from the original 0227, 0224, 0246, 0247 SQL plus the order_shipments table.
-- Paste ONE line at a time in the TiDB editor with cabinet_dealz selected.
-- Plain ADD COLUMN / CREATE TABLE. If a line answers "Duplicate column name" or
-- "Table already exists", that is SAFE: it was already there. Skip it and paste the next.
-- Only adds columns and tables. Inserts, updates and deletes nothing.

-- 1
ALTER TABLE cabinet_dealz.order_requests ADD COLUMN distributorEmailStatus VARCHAR(32) NULL;
-- 2
ALTER TABLE cabinet_dealz.order_requests ADD COLUMN distributorEmailSentAt TIMESTAMP NULL;
-- 3
ALTER TABLE cabinet_dealz.order_requests ADD COLUMN distributorEmailTo VARCHAR(1024) NULL;
-- 4
ALTER TABLE cabinet_dealz.order_requests ADD COLUMN distributorEmailError VARCHAR(1024) NULL;
-- 5
CREATE TABLE cabinet_dealz.order_distributor_emails (id INT NOT NULL AUTO_INCREMENT, orderRequestId INT NOT NULL, distributorId INT NOT NULL, distributorEmailStatus VARCHAR(32) NOT NULL DEFAULT 'pending', distributorEmailSentAt TIMESTAMP NULL, distributorEmailTo VARCHAR(1024) NULL, distributorEmailError VARCHAR(1024) NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, PRIMARY KEY (id), UNIQUE KEY order_distributor_emails_order_dist_uq (orderRequestId, distributorId));
-- 6
ALTER TABLE cabinet_dealz.order_requests ADD COLUMN orderVerifiedAt TIMESTAMP NULL;
-- 7
ALTER TABLE cabinet_dealz.order_requests ADD COLUMN orderVerifiedBy VARCHAR(255) NULL;
-- 8
ALTER TABLE cabinet_dealz.order_requests ADD COLUMN orderShippedAt TIMESTAMP NULL;
-- 9
ALTER TABLE cabinet_dealz.order_requests ADD COLUMN orderShippedBy VARCHAR(255) NULL;
-- 10
ALTER TABLE cabinet_dealz.order_requests ADD COLUMN shipmentCarrier VARCHAR(120) NULL;
-- 11
ALTER TABLE cabinet_dealz.order_requests ADD COLUMN shipmentTracking VARCHAR(255) NULL;
-- 12
ALTER TABLE cabinet_dealz.order_requests ADD COLUMN orderSignedAt TIMESTAMP NULL;
-- 13
ALTER TABLE cabinet_dealz.order_requests ADD COLUMN orderSignedBy VARCHAR(255) NULL;
-- 14
ALTER TABLE cabinet_dealz.order_requests ADD COLUMN signerName VARCHAR(255) NULL;
-- 15
ALTER TABLE cabinet_dealz.order_requests ADD COLUMN crmSyncStatus VARCHAR(32) NULL;
-- 16
ALTER TABLE cabinet_dealz.order_requests ADD COLUMN crmSyncError VARCHAR(1024) NULL;
-- 17
ALTER TABLE cabinet_dealz.order_requests ADD COLUMN crmDealId INT NULL;
-- 18
ALTER TABLE cabinet_dealz.order_requests ADD COLUMN imageGeneratedCount INT NOT NULL DEFAULT 0;
-- 19
ALTER TABLE cabinet_dealz.order_requests ADD COLUMN lastImageGeneratedAt TIMESTAMP NULL;
-- 20
ALTER TABLE cabinet_dealz.order_requests ADD COLUMN orderVerifiedEmailSentAt TIMESTAMP NULL;
-- 21
ALTER TABLE cabinet_dealz.order_requests ADD COLUMN palletPhotoUrl VARCHAR(1024) NULL;
-- 22
ALTER TABLE cabinet_dealz.order_requests ADD COLUMN palletPhotoUploadedAt TIMESTAMP NULL;
-- 23
ALTER TABLE cabinet_dealz.order_requests ADD COLUMN palletPhotoUploadedBy VARCHAR(256) NULL;
-- 24
ALTER TABLE cabinet_dealz.order_requests ADD COLUMN receiptSentAt TIMESTAMP NULL;
-- 25
ALTER TABLE cabinet_dealz.crm_deals ADD COLUMN saleRefundedAt TIMESTAMP NULL;
-- 26
CREATE TABLE cabinet_dealz.order_shipments (id INT NOT NULL AUTO_INCREMENT, orderRequestId INT NOT NULL, vendorScope VARCHAR(32) NOT NULL, status ENUM('pending','shipped') NOT NULL DEFAULT 'pending', carrier VARCHAR(64) NULL, trackingNumber VARCHAR(128) NULL, packageCount INT NOT NULL DEFAULT 1, notes VARCHAR(1000) NULL, labelPrintedAt TIMESTAMP NULL, shippedAt TIMESTAMP NULL, shippedByUserId INT NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, PRIMARY KEY (id), UNIQUE KEY order_shipments_order_scope_uq (orderRequestId, vendorScope));

-- 27 read-only check. crm_deals.stage needs new_sale for CRM New Sale. Look at COLUMN_TYPE.
SELECT COLUMN_TYPE FROM information_schema.columns WHERE table_schema = 'cabinet_dealz' AND table_name = 'crm_deals' AND column_name = 'stage';

-- 28 ONLY if line 27 does NOT list new_sale AND every value it lists is in this list. Otherwise skip and tell Chief of Staff.
ALTER TABLE cabinet_dealz.crm_deals MODIFY COLUMN stage ENUM('new','new_sale','contacted','qualified','image_review','quoted','won','lost') NOT NULL DEFAULT 'new';

-- 29 read-only. Re-run Query 4 from order-verified-column-check.sql. Expect 27 rows.
