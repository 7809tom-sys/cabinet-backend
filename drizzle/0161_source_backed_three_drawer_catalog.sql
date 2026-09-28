-- 3DB12 and 3DB21 retain current, positive, published supplier source rows
-- across active cabinet styles. Their master rows already carry verified
-- dimensional/configuration data, but were incorrectly retired from every
-- public catalog and Designer eligibility path. Restore only these two exact
-- source-backed masters; do not alter supplier prices, SKU rows, aliases,
-- descriptions, or any other catalog line.
UPDATE cabinets
SET
  isActive = TRUE,
  showInCatalog = TRUE,
  showInDesigner = TRUE
WHERE masterCode IN ('3DB12', '3DB21')
  AND conflictStatus <> 'conflict';
