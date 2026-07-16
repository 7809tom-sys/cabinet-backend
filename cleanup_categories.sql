-- ============================================================
-- Cabinet Category Cleanup
-- Target structure: Base | Wall | Corner | Tall | ADA | Vanity | Accessories
-- ============================================================

-- ── 1. CORNER CABINETS (pull from Base and Wall first) ────────────────────────
-- Corner Base
UPDATE cabinets SET category='Corner', subCategory='Corner Base'
WHERE (category IN ('Base','Base Cabinets') AND subCategory IN ('Corner Base Cabinet','Corner Base','Standard Base') AND masterCode LIKE 'BC%')
   OR (category IN ('Base','Base Cabinets') AND subCategory = 'Corner Base Cabinet');

UPDATE cabinets SET category='Corner', subCategory='Blind Corner Base'
WHERE category IN ('Base','Base Cabinets') AND subCategory = 'Blind Corner Base';

UPDATE cabinets SET category='Corner', subCategory='Lazy Susan Corner Base'
WHERE category IN ('Base','Base Cabinets') AND subCategory = 'Lazy Susan Corner Base';

UPDATE cabinets SET category='Corner', subCategory='Corner Sink Base'
WHERE category IN ('Base','Base Cabinets') AND subCategory IN ('Corner Sink Base','Diagonal Corner Sink Base');

UPDATE cabinets SET category='Corner', subCategory='Corner Drawer Base'
WHERE category IN ('Base','Base Cabinets') AND subCategory = 'Corner Drawer Base';

-- Corner Wall
UPDATE cabinets SET category='Corner', subCategory='Corner Wall'
WHERE category IN ('Wall','Wall Cabinets') AND subCategory IN ('Corner Wall','Wall Corner Angle');

UPDATE cabinets SET category='Corner', subCategory='Blind Corner Wall'
WHERE category IN ('Wall','Wall Cabinets') AND subCategory = 'Blind Corner Wall';

UPDATE cabinets SET category='Corner', subCategory='Diagonal Corner Wall'
WHERE category IN ('Wall','Wall Cabinets') AND subCategory = 'Diagonal Corner Wall';

UPDATE cabinets SET category='Corner', subCategory='Diagonal Corner Glass Door Wall'
WHERE category IN ('Wall','Wall Cabinets','Glass Doors') AND subCategory IN ('Diagonal Corner Glass Door Wall','Diagonal Plain Glass');

-- ── 2. GLASS DOORS → Wall (Glass Door Wall sub-category) ─────────────────────
UPDATE cabinets SET category='Wall', subCategory='Glass Door Wall'
WHERE category = 'Glass Doors' AND subCategory IN ('Double Plain Glass','Single Plain Glass','Single Mullion Glass');

-- ── 3. MERGE Base Cabinets → Base ─────────────────────────────────────────────
UPDATE cabinets SET category='Base', subCategory='Drawer Base'
WHERE category='Base Cabinets' AND subCategory='2 Drawer Base';

UPDATE cabinets SET category='Base', subCategory='Single Door Base'
WHERE category='Base Cabinets' AND subCategory='Single Door Full Height';

UPDATE cabinets SET category='Base', subCategory='Specialty Base'
WHERE category='Base Cabinets' AND subCategory='Spice Base';

-- Remaining Base Cabinets → Base (keep subCategory)
UPDATE cabinets SET category='Base'
WHERE category='Base Cabinets';

-- ── 4. MERGE Wall Cabinets → Wall ─────────────────────────────────────────────
UPDATE cabinets SET category='Wall', subCategory='Stacker Wall'
WHERE category='Wall Cabinets' AND subCategory IN ('Stacker Wall','Wall Oven Stacker');

UPDATE cabinets SET category='Wall', subCategory='Specialty Wall'
WHERE category='Wall Cabinets' AND subCategory='Three Drawer Wall';

-- Remaining Wall Cabinets → Wall (keep subCategory)
UPDATE cabinets SET category='Wall'
WHERE category='Wall Cabinets';

-- ── 5. MERGE Vanity Cabinets → Vanity ─────────────────────────────────────────
UPDATE cabinets SET category='Vanity', subCategory='Vanity Base'
WHERE category='Vanity Cabinets' AND subCategory IN ('Single Door Vanity','Double Door Vanity');

UPDATE cabinets SET category='Vanity', subCategory='Vanity Sink Base'
WHERE category='Vanity Cabinets' AND subCategory='Vanity Sink Base';

-- Remaining Vanity Cabinets → Vanity
UPDATE cabinets SET category='Vanity'
WHERE category='Vanity Cabinets';

-- ── 6. MERGE ADA Cabinets → ADA ───────────────────────────────────────────────
UPDATE cabinets SET category='ADA'
WHERE category='ADA Cabinets';

-- Move ADA items out of Base category
UPDATE cabinets SET category='ADA', subCategory='ADA Base'
WHERE category='Base' AND subCategory IN ('ADA Base Cabinet','ADA Base');

UPDATE cabinets SET category='ADA', subCategory='ADA Drawer Base'
WHERE category='Base' AND subCategory='ADA Drawer Base';

UPDATE cabinets SET category='ADA', subCategory='ADA Sink Base'
WHERE category='Base' AND subCategory='ADA Sink Base';

UPDATE cabinets SET category='ADA', subCategory='ADA Vanity'
WHERE category='Vanity' AND subCategory='ADA Vanity';

-- ── 7. MERGE Accessory → Accessories ──────────────────────────────────────────
UPDATE cabinets SET category='Accessories'
WHERE category='Accessory';

-- Move Panels/Fillers/Trims → Accessories
UPDATE cabinets SET category='Accessories', subCategory='Trim & Molding'
WHERE category='Panels/Fillers/Trims' AND subCategory='Moulding';

UPDATE cabinets SET category='Accessories', subCategory='Skin Panel'
WHERE category='Panels/Fillers/Trims' AND subCategory='Panel';

-- Move Pantry/Utility → Tall
UPDATE cabinets SET category='Tall', subCategory='Utility Cabinet'
WHERE category='Pantry/Utility';

-- ── 8. TALL — move Skin Panel to Tall ─────────────────────────────────────────
UPDATE cabinets SET category='Tall', subCategory='Tall Skin Panel'
WHERE category='Tall' AND subCategory='Skin Panel';

-- Also move Accessories skin panels that are tall (masterCode like TP% or EP% tall)
-- Keep Accessories skin panels as-is; only move if already in Tall

-- ── 9. NORMALIZE sub-categories within Base ───────────────────────────────────
UPDATE cabinets SET subCategory='Standard Base'
WHERE category='Base' AND subCategory IN ('Base Cabinet','Standard Base','Full Height Door Base');

UPDATE cabinets SET subCategory='Drawer Base'
WHERE category='Base' AND subCategory IN ('Drawer Base');

UPDATE cabinets SET subCategory='Sink Base'
WHERE category='Base' AND subCategory='Sink Base';

UPDATE cabinets SET subCategory='Farm Sink Base'
WHERE category='Base' AND subCategory='Farm Sink Base';

UPDATE cabinets SET subCategory='Full Height Base'
WHERE category='Base' AND subCategory='Full Height Base';

UPDATE cabinets SET subCategory='Single Door Base'
WHERE category='Base' AND subCategory='Single Door Base';

UPDATE cabinets SET subCategory='Tray Base'
WHERE category='Base' AND subCategory='Tray Base';

UPDATE cabinets SET subCategory='Specialty Base'
WHERE category='Base' AND subCategory IN ('Specialty Base','Base Spice Cabinet','Base Microwave Cabinet','Base End Cabinet');

-- Fix null/blank sub-categories in Base
UPDATE cabinets SET subCategory='Standard Base'
WHERE category='Base' AND (subCategory IS NULL OR subCategory='');

-- ── 10. NORMALIZE sub-categories within Wall ──────────────────────────────────
UPDATE cabinets SET subCategory='Standard Wall'
WHERE category='Wall' AND subCategory IN ('Standard Wall','Wall Cabinet','Double Door Wall');

UPDATE cabinets SET subCategory='Glass Door Wall'
WHERE category='Wall' AND subCategory IN ('Glass Door Wall','Glass Doors');

UPDATE cabinets SET subCategory='Bridge Cabinet'
WHERE category='Wall' AND subCategory='Bridge Cabinet';

UPDATE cabinets SET subCategory='Deep Wall'
WHERE category='Wall' AND subCategory='Deep Wall Cabinet';

UPDATE cabinets SET subCategory='Stacker Wall'
WHERE category='Wall' AND subCategory='Stacker Wall';

UPDATE cabinets SET subCategory='Microwave Wall'
WHERE category='Wall' AND subCategory='Microwave Wall Cabinet';

UPDATE cabinets SET subCategory='Specialty Wall'
WHERE category='Wall' AND subCategory IN ('Specialty Wall','Wall Spice Cabinet');

-- Fix null/blank sub-categories in Wall
UPDATE cabinets SET subCategory='Standard Wall'
WHERE category='Wall' AND (subCategory IS NULL OR subCategory='');

-- ── 11. NORMALIZE sub-categories within Tall ──────────────────────────────────
UPDATE cabinets SET subCategory='Pantry'
WHERE category='Tall' AND subCategory IN ('Pantry','Pantry / Utility');

UPDATE cabinets SET subCategory='Utility Cabinet'
WHERE category='Tall' AND subCategory IN ('Utility Cabinet','Utility Tower');

UPDATE cabinets SET subCategory='Oven Tower'
WHERE category='Tall' AND subCategory IN ('Oven Tower','Microwave / Oven Tower');

-- Fix null/blank sub-categories in Tall
UPDATE cabinets SET subCategory='Utility Cabinet'
WHERE category='Tall' AND (subCategory IS NULL OR subCategory='');

-- ── 12. NORMALIZE sub-categories within Vanity ────────────────────────────────
UPDATE cabinets SET subCategory='Vanity Base'
WHERE category='Vanity' AND subCategory IN ('Vanity Base','Vanity Cabinet');

UPDATE cabinets SET subCategory='Vanity Sink Base'
WHERE category='Vanity' AND subCategory='Vanity Sink Base';

UPDATE cabinets SET subCategory='Vanity Drawer Base'
WHERE category='Vanity' AND subCategory='Vanity Drawer Base';

UPDATE cabinets SET subCategory='Vanity Full Height'
WHERE category='Vanity' AND subCategory='Vanity Full Height Door';

-- Fix null/blank sub-categories in Vanity
UPDATE cabinets SET subCategory='Vanity Base'
WHERE category='Vanity' AND (subCategory IS NULL OR subCategory='');

-- ── 13. NORMALIZE sub-categories within Accessories ───────────────────────────
UPDATE cabinets SET subCategory='Filler'
WHERE category='Accessories' AND subCategory IN ('Filler','Decorative Filler');

UPDATE cabinets SET subCategory='Filler Panel'
WHERE category='Accessories' AND subCategory='Filler Panel';

UPDATE cabinets SET subCategory='Trim & Molding'
WHERE category='Accessories' AND subCategory IN ('Crown Molding','Light Rail','Scribe Molding','Valance','Trim & Molding','Batten');

UPDATE cabinets SET subCategory='Skin Panel'
WHERE category='Accessories' AND subCategory IN ('Skin Panel','Decorative End Panel');

UPDATE cabinets SET subCategory='Specialty'
WHERE category='Accessories' AND subCategory IN ('Specialty','Sample / Misc','Hardware / Misc','Accessory','Sink Dummy Front','Wall Spice Drawer','Standard Base');

UPDATE cabinets SET subCategory='Hardware'
WHERE category='Accessories' AND subCategory='Hardware';

UPDATE cabinets SET subCategory='Roll Out Shelf'
WHERE category='Accessories' AND subCategory IN ('Roll Out Shelf','Roll Out Trays');

UPDATE cabinets SET subCategory='Floating Shelf'
WHERE category='Accessories' AND subCategory='Floating Shelf';

UPDATE cabinets SET subCategory='Wine Storage'
WHERE category='Accessories' AND subCategory='Wine Storage';

UPDATE cabinets SET subCategory='Trash Can Kit'
WHERE category='Accessories' AND subCategory='Trash Can Kit';

UPDATE cabinets SET subCategory='Range Hood'
WHERE category='Accessories' AND subCategory='Range Hood';

UPDATE cabinets SET subCategory='Decorative Leg'
WHERE category='Accessories' AND subCategory='Decorative Leg';

UPDATE cabinets SET subCategory='Toe Kick'
WHERE category='Accessories' AND subCategory='Toe Kick';

-- Fix null/blank sub-categories in Accessories
UPDATE cabinets SET subCategory='Specialty'
WHERE category='Accessories' AND (subCategory IS NULL OR subCategory='');

-- ── 14. NORMALIZE sub-categories within ADA ───────────────────────────────────
UPDATE cabinets SET subCategory='ADA Base'
WHERE category='ADA' AND (subCategory IS NULL OR subCategory='');

-- ── 15. NORMALIZE sub-categories within Corner ────────────────────────────────
UPDATE cabinets SET subCategory='Corner Base'
WHERE category='Corner' AND (subCategory IS NULL OR subCategory='');
