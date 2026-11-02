-- TiDB SQL editor copy of drizzle/0228_designer_offer_all.sql.
-- Promotes every cabinet to Designer-eligible. Does not hide or reprice rows.
UPDATE `cabinets`
SET `designerEligible` = 1
WHERE `designerEligible` IS NULL OR `designerEligible` = 0;

ALTER TABLE `cabinets` MODIFY `designerEligible` boolean NOT NULL DEFAULT true;
