# Skyline W2742 audit notes

Date: 2026-10-13

## Official sources
- https://shop.skylinecabinetry.com/downloads — official Skyline downloads page. It labels the software catalog as the “NEWEST 2026 VERSION 2020 software catalog” and links the Premium Line download.
- https://drive.google.com/uc?export=download&id=1JVvquTFvW7WCH60Th-0hB32iX7skoVnB — official Premium Line 2026 software catalog download used for the structured item record.
- https://shop.skylinecabinetry.com/products.html — official public product/style list. It lists framed lines and the relevant style families, plus frameless glass lines.
- https://shop.skylinecabinetry.com/double-smokey-grey-w2742.html — official W2742 product URL; fetch redirects to a login shell, so it is not sufficient for numeric spec extraction.

## Official package extraction
- CatalogVersion.json: manufacturer Skyline Cabinetry; catalog SKYLINE1; lastModifDate 2025/06/18 14:04:22; measure system Imperial.
- File: ConversionData/CiC3/Items_Kitchen.Cabinet.Wall.Standard.Rectangular_0.json
- Item code W2742; description “Wall Cabinet - 2 Doors - 3 Shelves”; full item type Kitchen.Cabinet.Wall.Standard.Rectangular..FullDoor.HBoth.
- Default dimensions: 27 W x 42 H x 12 D inches. Parametric ranges: W 27–36, H 4.5–42, D 0.0625–12.
- Attributes: CCPC=Framed; CCSBOX=Standard Wall; CSCB=Full Back; CCSCT=Full Top; CCSGC=Full Height Door; CCNS1=3; CCNFD1=2; CCNCS=TRUE; hinge both. Official item does not use the word “adjustable” in its item description, although the structured count is three shelves.
- Official image: assets/images/w2742.jpg and Multimedia/Pictures/Large/W2742.jpg, 200x200.
- Separate official glass wall item W2712GD appears in Items_Kitchen.Cabinet.Wall.Standard.Rectangular.Glass_0.json, with a Glass fullItemType. W2742 is standard rectangular wall, not a glass item.

## Live Cabinet Dealz rows
- Canonical active master: id 9360081, masterCode W2742, category Wall, subCategory Standard Wall, placementType wall, 27 x 42 x 12, 2 doors, 0 drawers, 0 fixed shelves, 3 adjustable shelves, conflictStatus none, isActive=1, showInDesigner=1, showInCatalog=1.
- W2742 DB description: “27\" × 42\" × 12\" Wall Cabinet — 2 Doors, 3 Adjustable Shelves”.
- W2742 master fields: constructionMethod NULL; doorOrientation NULL; doorsPerRow NULL; layoutSpec NULL; specNotes carries the same 2-door/3-shelf wording.
- W2742 master SKU aliases: sku W27-42; vendorSku W27-42.
- W2742 catalogImageUrl: /manus-storage/media-library/1787932416477_w2442_3642_1_f9ced527 (240x300 project image, dimensioned open-door cabinet). specImageUrl: /manus-storage/media-library/1787932459825_w2442_3642_1_0a0c0e03. These identifiers reference w2442_3642, not the canonical W2742 source asset name.
- Before the nomenclature correction, duplicate master id 9390132 used masterCode W-2742 and was hidden. It has now been removed as a duplicate master record; W-2742 is represented as a visible alias of canonical id 9360081. Both W-2742 and W-27-42 resolve to W2742.
- Skyline distributor id 180001 is active and named Skyline Cabinetry. It has 32 W2742 mappings across six profile families: Double Shaker 2, Glass 2, Raised Panel 1, Shaker 16, Slab 6, Slim Shaker 5. All 32 have doorStyle and finish values; 16 lack boxConstruction, 32 lack frameSize, 24 lack overlayType, 23 lack doorPanelType, and 25 lack color. These are style-table completeness gaps, not dimensional errors in the master cabinet.
- Aggregate canonical W2742 mappings: 71 total across 5 distributors and 71 style IDs; all 71 were available/published in the read-only query. List price range $412–$988; your-cost range $144.20–$291.11.

## Corrections applied

### Nomenclature policy

Cabinet Dealz does not retire or hide nomenclature codes. Every code remains represented either by one active master SKU or by an active alias that resolves to that master. The database duplicate row is not the product identity: the historical `W-2742` code remains active and searchable as an alias of master `W2742`.

The active canonical row `W2742` (id `9360081`) was corrected without changing any distributor SKU or price rows. Its description now uses the official three-shelf wording; it records Skyline Cabinetry 2026 Premium Line as the source; it now stores framed/standard-wall/full-top/full-back/full-height-door construction, side-by-side doors, two doors per row, both hinges, and the exact 27 x 42 x 12 dimensions. The official Skyline W2742 image was uploaded to `/manus-storage/W2742-skyline-2026_80acc0a1.jpg` and assigned as the canonical catalog image.

The duplicate `W-2742` row was not left hidden. Its historical references were re-pointed to canonical id `9360081`, and the duplicate row was removed. `W-2742` and `W-27-42` are visible alias codes that resolve to master `W2742`; the reciprocal `W2742 → W-2742` alias and the two-way code-equivalence record were removed so there is one unambiguous master.

Post-update verification: canonical W2742 is active, catalog-visible, Designer-visible, and conflict-free; no duplicate W-2742 cabinet row or duplicate historical references remain. Both alias URLs `/catalog/W-2742` and `/catalog/W2742` resolve to the same live product. The corrected image returns HTTP 200, is JPEG 200x200, and has SHA-256 `e6b9a0974b57697a2450a41d1852df6311129ba677266eb346638c0eb17bd8c1`.
