-- One shared door approval (Designer, Door Rendering Audit, Featured Styles).
-- Numbered 0241. Run after 0223 (door rendering audit tables). Run BEFORE the backend release deploys.
-- Paste each numbered block on its own in the TiDB SQL editor. One statement per block.
-- Every table is cabinet_dealz.<table>. Nothing is deleted; existing rows get source = 'audit'.
-- Safe to re-run where IF NOT EXISTS guards are used. The ENUM change in block 6 is safe to re-run.

-- 1
ALTER TABLE cabinet_dealz.door_rendering_versions ADD COLUMN IF NOT EXISTS source ENUM('audit','designer','featured') NOT NULL DEFAULT 'audit';

-- 2
ALTER TABLE cabinet_dealz.door_rendering_versions ADD COLUMN IF NOT EXISTS renderHex VARCHAR(16) NULL;

-- 3
ALTER TABLE cabinet_dealz.door_rendering_versions ADD COLUMN IF NOT EXISTS approvedDoorImageUrl VARCHAR(512) NULL;

-- 4
ALTER TABLE cabinet_dealz.door_rendering_versions ADD COLUMN IF NOT EXISTS approvedDrawerImageUrl VARCHAR(512) NULL;

-- 5
COMMIT;

-- 6 adds 'revoked' so an approval can be withdrawn without deleting anything
ALTER TABLE cabinet_dealz.door_rendering_version_events MODIFY COLUMN action ENUM('accepted','rejected','reverted','revoked') NOT NULL;

-- 7
COMMIT;

-- 8 read-only check. Expect 4 rows from the first query and 'revoked' in the second.
SELECT COLUMN_NAME FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'cabinet_dealz' AND TABLE_NAME = 'door_rendering_versions'
  AND COLUMN_NAME IN ('source','renderHex','approvedDoorImageUrl','approvedDrawerImageUrl');

-- 9
SELECT COLUMN_TYPE FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'cabinet_dealz' AND TABLE_NAME = 'door_rendering_version_events' AND COLUMN_NAME = 'action';

-- 10
SELECT 'COMMITTED';
