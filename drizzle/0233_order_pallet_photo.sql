-- Migration 0233. Journal idx 232, when 1795400000000. It follows
-- 0232_order_verified_email, the last entry in the journal.
-- TiDB SQL editor statements are in docs/sql/0247_order_pallet_photo.tidb.sql.
--
-- Additive only: the URL of the pallet photo taken before an order ships, plus
-- who uploaded it and when. The image itself lives in existing file storage.
-- As with the other order trail columns these are deliberately NOT declared in
-- drizzle/schema.ts: they are read and written through raw SQL behind an
-- information_schema probe, so an unapplied migration means "no photo yet"
-- rather than a broken order read.
ALTER TABLE `order_requests` ADD COLUMN IF NOT EXISTS `palletPhotoUrl` varchar(1024) NULL;--> statement-breakpoint
ALTER TABLE `order_requests` ADD COLUMN IF NOT EXISTS `palletPhotoUploadedAt` timestamp NULL;--> statement-breakpoint
ALTER TABLE `order_requests` ADD COLUMN IF NOT EXISTS `palletPhotoUploadedBy` varchar(256) NULL;
