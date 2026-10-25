-- Backfill distributor SKUs for the 24"-deep refrigerator wall cabinets
-- (W-30/33/36-{12,15,18,24}-24) so they are available in every (distributor, style)
-- where their same-width regular wall cabinet anchor (W-xx-30) already has a SKU.
--
-- Pricing is copied from the anchor row. platformSku is made unique by swapping the
-- anchor's cabinet-code prefix for the fridge cabinet's compact code. Idempotent:
-- only inserts rows that do not already exist for the (cabinet, distributor, style).

INSERT INTO distributor_skus (
  cabinetId, distributorId, styleId,
  platformSku, distributorSku,
  listPrice, yourCost, adjustedListPrice, wholesalePrice, contractorPrice, homeownerPrice,
  isAvailable, isPublished, supplierCabinetName, createdAt
)
SELECT
  f.id                                              AS cabinetId,
  sa.distributorId                                  AS distributorId,
  sa.styleId                                        AS styleId,
  CONCAT(REPLACE(f.masterCode, '-', ''),
         SUBSTRING(sa.platformSku, LENGTH(SUBSTRING_INDEX(sa.platformSku, '-', 1)) + 1)) AS platformSku,
  REPLACE(f.masterCode, '-', '')                    AS distributorSku,
  sa.listPrice, sa.yourCost, sa.adjustedListPrice, sa.wholesalePrice, sa.contractorPrice, sa.homeownerPrice,
  sa.isAvailable, sa.isPublished, sa.supplierCabinetName, NOW()
FROM cabinets f
JOIN cabinets a
  ON a.masterCode = CONCAT(SUBSTRING_INDEX(f.masterCode, '-', 2), '-30')
JOIN distributor_skus sa
  ON sa.cabinetId = a.id
WHERE f.subCategory LIKE '%Refrigerator%'
  AND f.category = 'Wall'
  AND f.isActive = 1
  AND f.depth = '24.00'
  AND NOT EXISTS (
    SELECT 1 FROM distributor_skus sf
    WHERE sf.cabinetId = f.id
      AND sf.distributorId = sa.distributorId
      AND sf.styleId = sa.styleId
  );
