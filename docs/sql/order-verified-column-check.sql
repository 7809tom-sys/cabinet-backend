-- READ ONLY. Order-verified column check for Tokyo TiDB (cabinet_dealz).
-- Run each query and paste the results to Chief of Staff. Nothing here changes data.

-- Query 1
SELECT DATABASE() AS currentDb, CURRENT_USER() AS currentUser;

-- Query 2
SELECT table_schema, table_name FROM information_schema.tables WHERE LOWER(table_name) LIKE '%order%' AND table_schema NOT IN ('INFORMATION_SCHEMA','PERFORMANCE_SCHEMA','METRICS_SCHEMA','mysql') ORDER BY table_schema, table_name;

-- Query 3
SELECT table_schema, table_name, column_name FROM information_schema.columns WHERE LOWER(column_name) IN ('orderverifiedat','orderverifiedby','orderverifiedemailsentat','receiptsentat','palletphotourl','salerefundedat') ORDER BY table_schema, table_name, column_name;

-- Query 4 (should return 27 rows)
SELECT table_name, column_name, column_type FROM information_schema.columns WHERE table_schema = 'cabinet_dealz' AND ((table_name = 'order_requests' AND column_name IN ('distributorEmailStatus','distributorEmailSentAt','distributorEmailTo','distributorEmailError','orderVerifiedAt','orderVerifiedBy','orderShippedAt','orderShippedBy','shipmentCarrier','shipmentTracking','orderSignedAt','orderSignedBy','signerName','crmSyncStatus','crmSyncError','crmDealId','imageGeneratedCount','lastImageGeneratedAt','orderVerifiedEmailSentAt','palletPhotoUrl','palletPhotoUploadedAt','palletPhotoUploadedBy','receiptSentAt')) OR (table_name = 'crm_deals' AND column_name IN ('saleRefundedAt','stage')) OR (table_name = 'order_distributor_emails' AND column_name = 'orderRequestId') OR (table_name = 'order_shipments' AND column_name = 'orderRequestId')) ORDER BY table_name, column_name;
