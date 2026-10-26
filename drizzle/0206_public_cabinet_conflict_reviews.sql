-- Public cabinet-conflict reviews (workbook 2026-10-26).
-- Status 'review' is listed in the admin Conflicts tab and is NOT excluded
-- by the public catalog predicate (that predicate only excludes 'conflict').
-- Does not change publication, visibility, prices, or SKUs.
-- Rows already held as hidden conflicts keep that hold; the review note is appended.
-- Rows with no conflict are flagged as public reviews.

ALTER TABLE `cabinets` ADD `importLockedFields` json;

UPDATE `cabinets`
SET
  `conflictReason` = CONCAT(IFNULL(CONCAT(`conflictReason`, '\n\n'), ''), 'Issue: Door thickness set to 1" D from a Faircrest dealer listing, not Faircrest''s own catalog. Glass pane thickness is unpublished.\nCurrent value: Plain Glass (PG) Door Only — 15" W x 30" H x 1" D; fits DCW2430 / WDC2430 diagonal corner wall\nSource: Faircrest (CS) dealer listing CabinetryStock, not Faircrest''s own catalog. Workbook row 69.\nNeeded: Manufacturer confirmation of door thickness and glass pane thickness.\nResolved fields: description, depth'),
  `conflictedAt` = NOW()
WHERE `masterCode` = 'PGWDC30'
  AND `conflictStatus` = 'conflict'
  AND (`conflictReason` IS NULL OR `conflictReason` NOT LIKE 'Issue:%');

UPDATE `cabinets`
SET
  `conflictStatus` = 'review',
  `conflictReason` = 'Issue: Door thickness set to 1" D from a Faircrest dealer listing, not Faircrest''s own catalog. Glass pane thickness is unpublished.\nCurrent value: Plain Glass (PG) Door Only — 15" W x 30" H x 1" D; fits DCW2430 / WDC2430 diagonal corner wall\nSource: Faircrest (CS) dealer listing CabinetryStock, not Faircrest''s own catalog. Workbook row 69.\nNeeded: Manufacturer confirmation of door thickness and glass pane thickness.\nResolved fields: description, depth',
  `conflictedAt` = NOW()
WHERE `masterCode` = 'PGWDC30'
  AND `conflictStatus` = 'none';

UPDATE `cabinets`
SET
  `conflictReason` = CONCAT(IFNULL(CONCAT(`conflictReason`, '\n\n'), ''), 'Issue: Door thickness set to 1" D from a Faircrest dealer listing, not Faircrest''s own catalog. Glass pane thickness is unpublished.\nCurrent value: Plain Glass (PG) Door Only — 15" W x 36" H x 1" D; fits DCW2436 / WDC2436 diagonal corner wall\nSource: Faircrest (CS) dealer listing CabinetryStock, not Faircrest''s own catalog. Workbook row 70.\nNeeded: Manufacturer confirmation of door thickness and glass pane thickness.\nResolved fields: description, depth'),
  `conflictedAt` = NOW()
WHERE `masterCode` = 'PGWDC36'
  AND `conflictStatus` = 'conflict'
  AND (`conflictReason` IS NULL OR `conflictReason` NOT LIKE 'Issue:%');

UPDATE `cabinets`
SET
  `conflictStatus` = 'review',
  `conflictReason` = 'Issue: Door thickness set to 1" D from a Faircrest dealer listing, not Faircrest''s own catalog. Glass pane thickness is unpublished.\nCurrent value: Plain Glass (PG) Door Only — 15" W x 36" H x 1" D; fits DCW2436 / WDC2436 diagonal corner wall\nSource: Faircrest (CS) dealer listing CabinetryStock, not Faircrest''s own catalog. Workbook row 70.\nNeeded: Manufacturer confirmation of door thickness and glass pane thickness.\nResolved fields: description, depth',
  `conflictedAt` = NOW()
WHERE `masterCode` = 'PGWDC36'
  AND `conflictStatus` = 'none';

UPDATE `cabinets`
SET
  `conflictReason` = CONCAT(IFNULL(CONCAT(`conflictReason`, '\n\n'), ''), 'Issue: Door thickness set to 1" D from a Faircrest dealer listing, not Faircrest''s own catalog. Glass pane thickness is unpublished.\nCurrent value: Plain Glass (PG) Door Only — 15" W x 42" H x 1" D; fits DCW2442 / WDC2442 diagonal corner wall\nSource: Faircrest (CS) dealer listing CabinetryStock, not Faircrest''s own catalog. Workbook row 71.\nNeeded: Manufacturer confirmation of door thickness and glass pane thickness.\nResolved fields: description, depth'),
  `conflictedAt` = NOW()
WHERE `masterCode` = 'PGWDC42'
  AND `conflictStatus` = 'conflict'
  AND (`conflictReason` IS NULL OR `conflictReason` NOT LIKE 'Issue:%');

UPDATE `cabinets`
SET
  `conflictStatus` = 'review',
  `conflictReason` = 'Issue: Door thickness set to 1" D from a Faircrest dealer listing, not Faircrest''s own catalog. Glass pane thickness is unpublished.\nCurrent value: Plain Glass (PG) Door Only — 15" W x 42" H x 1" D; fits DCW2442 / WDC2442 diagonal corner wall\nSource: Faircrest (CS) dealer listing CabinetryStock, not Faircrest''s own catalog. Workbook row 71.\nNeeded: Manufacturer confirmation of door thickness and glass pane thickness.\nResolved fields: description, depth',
  `conflictedAt` = NOW()
WHERE `masterCode` = 'PGWDC42'
  AND `conflictStatus` = 'none';

UPDATE `cabinets`
SET
  `conflictReason` = CONCAT(IFNULL(CONCAT(`conflictReason`, '\n\n'), ''), 'Issue: Description is based on Faircrest dealer listings, not Faircrest''s own catalog.\nCurrent value: Stained Plywood Panel - 96"W x 36"H x 1/4"D\nSource: Faircrest dealer listings thewhiteshaker.com and rtacabinets365.com (BC-SPW), not Faircrest''s own catalog. Distributor CS. Workbook row 330.\nNeeded: Faircrest catalog confirmation of the stained plywood panel size and description.\nResolved fields: description'),
  `conflictedAt` = NOW()
WHERE `masterCode` = 'SPW'
  AND `conflictStatus` = 'conflict'
  AND (`conflictReason` IS NULL OR `conflictReason` NOT LIKE 'Issue:%');

UPDATE `cabinets`
SET
  `conflictStatus` = 'review',
  `conflictReason` = 'Issue: Description is based on Faircrest dealer listings, not Faircrest''s own catalog.\nCurrent value: Stained Plywood Panel - 96"W x 36"H x 1/4"D\nSource: Faircrest dealer listings thewhiteshaker.com and rtacabinets365.com (BC-SPW), not Faircrest''s own catalog. Distributor CS. Workbook row 330.\nNeeded: Faircrest catalog confirmation of the stained plywood panel size and description.\nResolved fields: description',
  `conflictedAt` = NOW()
WHERE `masterCode` = 'SPW'
  AND `conflictStatus` = 'none';

UPDATE `cabinets`
SET
  `conflictReason` = CONCAT(IFNULL(CONCAT(`conflictReason`, '\n\n'), ''), 'Issue: Size verified only from US Cabinet Depot. Skyline version is not verified.\nCurrent value: Stem Glass Holder — 30" W x 1-1/2" H x 12" D\nSource: US Cabinet Depot listing. Sheet distributors: SK; USCD. Workbook row 90. Grok Bot comment: SK version not verified.\nNeeded: Skyline (SK) confirmation of the stem glass holder size.\nResolved fields: description, width, height, depth'),
  `conflictedAt` = NOW()
WHERE `masterCode` = 'SGH30'
  AND `conflictStatus` = 'conflict'
  AND (`conflictReason` IS NULL OR `conflictReason` NOT LIKE 'Issue:%');

UPDATE `cabinets`
SET
  `conflictStatus` = 'review',
  `conflictReason` = 'Issue: Size verified only from US Cabinet Depot. Skyline version is not verified.\nCurrent value: Stem Glass Holder — 30" W x 1-1/2" H x 12" D\nSource: US Cabinet Depot listing. Sheet distributors: SK; USCD. Workbook row 90. Grok Bot comment: SK version not verified.\nNeeded: Skyline (SK) confirmation of the stem glass holder size.\nResolved fields: description, width, height, depth',
  `conflictedAt` = NOW()
WHERE `masterCode` = 'SGH30'
  AND `conflictStatus` = 'none';

UPDATE `cabinets`
SET
  `conflictReason` = CONCAT(IFNULL(CONCAT(`conflictReason`, '\n\n'), ''), 'Issue: Drawer count is 1 or 2 by distributor. USCD is phasing B30 out for B30S and does not offer it in Oxford or Edgeline. Faircrest and Skyline drawer counts are not verified.\nCurrent value: 30" W x 34-1/2" H x 24" D Base Cabinet — 2 Doors, 1 or 2 Drawers by distributor (see Brand Attributes); 1 shelf\nSource: Workbook row 189. Distributors: CS; SK; USCD. Grok Bot comment: CS/SK versions not verified.\nNeeded: Confirm Faircrest and Skyline drawer counts, and whether USCD still sells B30 or only B30S.\nResolved fields: description, numberOfDrawers'),
  `conflictedAt` = NOW()
WHERE `masterCode` = 'B30'
  AND `conflictStatus` = 'conflict'
  AND (`conflictReason` IS NULL OR `conflictReason` NOT LIKE 'Issue:%');

UPDATE `cabinets`
SET
  `conflictStatus` = 'review',
  `conflictReason` = 'Issue: Drawer count is 1 or 2 by distributor. USCD is phasing B30 out for B30S and does not offer it in Oxford or Edgeline. Faircrest and Skyline drawer counts are not verified.\nCurrent value: 30" W x 34-1/2" H x 24" D Base Cabinet — 2 Doors, 1 or 2 Drawers by distributor (see Brand Attributes); 1 shelf\nSource: Workbook row 189. Distributors: CS; SK; USCD. Grok Bot comment: CS/SK versions not verified.\nNeeded: Confirm Faircrest and Skyline drawer counts, and whether USCD still sells B30 or only B30S.\nResolved fields: description, numberOfDrawers',
  `conflictedAt` = NOW()
WHERE `masterCode` = 'B30'
  AND `conflictStatus` = 'none';
