-- DL Cabinetry door sample photos (DL-WS, DL-SSA, DL-SSE). By-hand TiDB SQL. NOT RUN by the PR.
-- One statement per numbered block. Paste each block on its own.
--
-- ORDER MATTERS: run `scripts/upload-dl-door-images.ts` FIRST (needs Supabase storage env). Until the files
-- are in storage these URLs point to nothing. The URLs below are the exact keys that script uploads.
--
-- Sets doorSampleImageUrl, and thumbnailImageUrl only when it is still empty (the app does the same when a
-- door sample is saved). Does NOT set doorSampleVerified: Tom confirms that. Does NOT set isActive: DL styles
-- stay offline (isActive = 0) until Tom activates them. DL-LUXE-TBD has no photo and is not touched.
-- Source: https://www.dlcabinetry.com/collections, downloaded 2026-10-31 (see door-images/manifest.csv).

-- 1 DL-WS White Shaker
UPDATE cabinet_dealz.door_styles
SET doorSampleImageUrl = '/manus-storage/dl-cabinetry-white-shaker-door_acea187d.png',
    thumbnailImageUrl = IF(thumbnailImageUrl IS NULL OR thumbnailImageUrl = '', '/manus-storage/dl-cabinetry-white-shaker-door_acea187d.png', thumbnailImageUrl)
WHERE distributorId = 450001 AND styleCode = 'DL-WS';

-- 2 DL-SSA Slim Shaker Alabaster
UPDATE cabinet_dealz.door_styles
SET doorSampleImageUrl = '/manus-storage/dl-cabinetry-slim-shaker-alabaster-door_8036801b.png',
    thumbnailImageUrl = IF(thumbnailImageUrl IS NULL OR thumbnailImageUrl = '', '/manus-storage/dl-cabinetry-slim-shaker-alabaster-door_8036801b.png', thumbnailImageUrl)
WHERE distributorId = 450001 AND styleCode = 'DL-SSA';

-- 3 DL-SSE Slim Shaker Ebony
UPDATE cabinet_dealz.door_styles
SET doorSampleImageUrl = '/manus-storage/dl-cabinetry-slim-shaker-ebony-door_aa279eb6.png',
    thumbnailImageUrl = IF(thumbnailImageUrl IS NULL OR thumbnailImageUrl = '', '/manus-storage/dl-cabinetry-slim-shaker-ebony-door_aa279eb6.png', thumbnailImageUrl)
WHERE distributorId = 450001 AND styleCode = 'DL-SSE';

-- 4 read-only check. Expect 3 rows, doorSampleImageUrl set, doorSampleVerified = 0, isActive = 0.
SELECT styleCode, doorSampleImageUrl, thumbnailImageUrl, doorSampleVerified, isActive
FROM cabinet_dealz.door_styles
WHERE distributorId = 450001 AND styleCode IN ('DL-WS', 'DL-SSA', 'DL-SSE', 'DL-LUXE-TBD')
ORDER BY styleCode;
