-- Every catalog item is Designer-eligible. Placeable pieces render, interior
-- trays attach to a host cabinet, and non-placeable accessories are ordered
-- from the designer onto the quote. This only promotes NULL/false flags. It
-- does not change price, publication, or showInDesigner.
UPDATE `cabinets`
SET `designerEligible` = 1
WHERE `designerEligible` IS NULL OR `designerEligible` = 0;--> statement-breakpoint
ALTER TABLE `cabinets` MODIFY `designerEligible` boolean NOT NULL DEFAULT true;
