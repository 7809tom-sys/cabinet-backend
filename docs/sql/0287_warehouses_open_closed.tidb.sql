-- TiDB SQL editor version. Numbered 0287. Run after 0286.
-- Paste each numbered block on its own. One statement per block.
-- Every table is cabinet_dealz.<table>.
--
-- What it does: adds ONE new table, warehouses, so a distributor warehouse can
-- be marked open or closed without deleting it. Origin ZIP lists
-- (distributors.warehouseZips, door_styles.warehouseZip, door_styles.warehouseZips)
-- are not changed. A closed ZIP is skipped when freight, quotes, availability,
-- pickup, and hardware choose a ship-from ZIP. Until this file is run, the
-- application treats every warehouse as open.
--
-- Block 2 inserts Woodland Sacramento under Skyline (distributor 180001),
-- CLOSED. It does not add 95691 to any origin list, so that warehouse cannot
-- be selected. INSERT IGNORE is safe to run twice.
-- Block 3 is read-only.

-- 1. One row per distributor + ZIP. isOpen defaults to open for any warehouse
--    created later from the admin toggle. Woodland is inserted closed in block 2.
CREATE TABLE IF NOT EXISTS cabinet_dealz.warehouses (
  id INT NOT NULL AUTO_INCREMENT,
  distributorId INT NOT NULL,
  zip VARCHAR(5) NOT NULL,
  name VARCHAR(128) NOT NULL,
  address VARCHAR(512) NULL,
  isOpen TINYINT(1) NOT NULL DEFAULT 1,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY warehouses_distributor_zip_uq (distributorId, zip),
  KEY warehouses_distributor_open_idx (distributorId, isOpen)
);

-- 2. Woodland Sacramento, closed, and not added to Skyline's origin ZIP lists.
INSERT IGNORE INTO cabinet_dealz.warehouses (distributorId, zip, name, address, isOpen)
VALUES (180001, '95691', 'Woodland Sacramento', '2925 Ramco St, West Sacramento CA 95691', 0);

-- 3. Read-only check. tablePresent = 1, columnsPresent = 6, woodlandOpen = 0,
--    and both origin-list counts = 0 (95691 was not added to a shipping origin).
SELECT
  (SELECT COUNT(*) FROM information_schema.tables
     WHERE table_schema = 'cabinet_dealz' AND table_name = 'warehouses') AS tablePresent,
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema = 'cabinet_dealz'
       AND table_name = 'warehouses'
       AND column_name IN ('distributorId', 'zip', 'name', 'address', 'isOpen', 'updatedAt')) AS columnsPresent,
  (SELECT isOpen FROM cabinet_dealz.warehouses
     WHERE distributorId = 180001 AND zip = '95691' LIMIT 1) AS woodlandOpen,
  (SELECT COUNT(*) FROM cabinet_dealz.distributors
     WHERE id = 180001
       AND JSON_CONTAINS(COALESCE(warehouseZips, JSON_ARRAY()), JSON_QUOTE('95691'))) AS zipOnDistributor,
  (SELECT COUNT(*) FROM cabinet_dealz.door_styles
     WHERE distributorId = 180001
       AND (
         warehouseZip = '95691'
         OR JSON_CONTAINS(COALESCE(warehouseZips, JSON_ARRAY()), JSON_QUOTE('95691'))
       )) AS zipOnStyles;
-- Expected: tablePresent = 1, columnsPresent = 6, woodlandOpen = 0,
--           zipOnDistributor = 0, zipOnStyles = 0.
