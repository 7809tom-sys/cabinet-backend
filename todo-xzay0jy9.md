# CabinetDealz Session TODO

## NAC Catalog Import Parser Fix

- [x] Fix CatalogImporterTab.tsx to detect NAC DataPack ZIP format and parse ConversionData CSV files instead of paf.xml
- [x] Add parseDataPackZip() function to CatalogImporterTab.tsx that reads 10_Products.csv and 72_PriceTags_Default.csv
- [x] Add 14 targeted unit tests for DataPack detection/parsing — all pass
- [x] Run tests and verify fix works — all 14 new DataPack tests pass, all existing catalog import tests pass
- [x] Save checkpoint and deploy

## Distributor Selector + New Vendor Creation in Catalog Import

- [x] Review distributor list query and vendor creation endpoint
- [x] Replace plain number input with a Select dropdown showing "Brand Name (ID: 123)"
- [x] Add "Add new vendor" inline form to create a new distributor without leaving the page
- [x] Save checkpoint and deploy

## 20/20 Catalog Importer — "nothing uploaded" bug

- [x] Trace full import flow (client handleImport → server initializeImport + executeImport)
- [x] Fix broken step so uploaded ZIP is actually parsed and products are imported
- [x] Test and deploy

## Import Result Card

- [x] Fix import result — show persistent Created/Updated/Skipped card instead of 3-second flash
- [x] Add dismiss button to result card

## New Item Creation

- [x] Audit why new product codes from distributor catalogs may be skipped instead of created
- [x] Fix create path so any new product code is inserted as a new cabinet with its SKU and pricing
- [x] Test and deploy

## 20/20 Catalog Update Flow

- [ ] Audit what fields are refreshed when an existing product is re-imported via 20/20 catalog
- [ ] Improve update path if needed and surface update details in the import result card
- [ ] Deploy and confirm

## Elevation View Cabinet Borders

- [ ] Find the elevation renderer code that draws cabinet borders/frames
- [ ] Remove the unwanted border outlines around cabinets in elevation view
- [ ] Deploy and confirm

## Tall Cabinet 2D Rendering Fix

- [x] Identify root cause: FrontByType switch had no case for "pantry" or "oven-tall" — both fell through to StandardDoorFront which rendered a single door with a top drawer band (the "drawer front border")
- [x] Add PantryFront renderer: outer box split into 2 stacked door sections at ~54% height, each with 1 or 2 side-by-side doors (2 for wide >= 24"), no drawer band, horizontal divider line, door knobs on meeting-stile edges
- [x] Add OvenTallFront renderer: 2 upper doors + appliance opening (grey dashed cavity, single or double oven) + lower drawer fronts with bar pulls
- [x] Wire both into FrontByType switch (case "pantry" and case "oven-tall")
- [x] TypeScript check passes with no errors
