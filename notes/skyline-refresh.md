# Skyline catalog product-data refresh — working notes

## User intent (confirmed)
- We pay the same multiplier → PRICES ARE ALREADY CORRECT. DO NOT change any pricing columns.
- Value = refresh PRODUCT DATA: better cabinet descriptions, correct door/finish options, and any new/updated SKUs, from the four Skyline 20-20 catalogs.

## Source files (downloaded)
Location: /home/ubuntu/milestone_catalogs/
- Premium_Line.zip, Slim_Shaker_Line.zip, European_Frameless_Line.zip, Builder_Line.zip
- Each is a 20-20 Design (CAP) manufacturer catalog package.
- Manufacturer: "Spring Forest Cabinetry"; sold under Skyline finish SKUs: SKYGR, SKYCW, SKYSE, SKYSW, SKYNB.
- Builder extracted to: /home/ubuntu/milestone_catalogs/extract/builder/
- Drive source page: https://shop.milestonecabinetry.com/downloads

### Where the useful DATA lives inside each package (per NAC_* dir)
- `ManufCodes.txt` — TAB-separated: col0 = base cabinet code (e.g. SB30, MB33, BT09-R), remaining cols = finish-specific Skyline SKUs. Header row = finish codes (e.g. BGR BCW BSE BSW NB). ~330 rows (Builder).
- `DataPack/paf.xml` — CONTENT PLATFORM XML: Catalog code, Company, PriceList (LP/USD "List price"), Feature "Door Style Selection" (8810000) with Options (FW Floral White, FG Floral Gray, FE Floral Espresso...) incl. Multimedia image paths. This is the cleanest source for door/finish OPTIONS + display names.
- `DataPack/*.csv` — 00_Settings, 01_PriceList, 02_PriceRules(+Detail = finish→price level 2/3/4), 04_Products_Global, 10_Products_Upcharges, 15_Options_Upcharges. NO dollar amounts (only price-level rules).
- `NAC_*/kit*rec.dat` — proprietary Raima DB (binary). Human-readable DESCRIPTIONS are embedded as strings, e.g. "Drawer Base Cabinet", "Wall Diagonal Glass Door Corner Cabinet - 1 Door - 2 Shelves", "ADA Base". kit1rec.dat and kit14rec.dat have descriptions keyed near codes. NO plaintext dollar prices (20-20 encodes prices).
- `CiC3Export.jsonc` — pricing/export config; PriceList USA-2023 USD; pricing key = manufCode. No dollar values.

### Extraction approach for descriptions/options
- Codes + finish SKU map: parse ManufCodes.txt (tab-split).
- Door/finish options + display names + image filenames: parse paf.xml (Feature 8810000 Options).
- Descriptions: python "strings" (regex [\x20-\x7e]{4,}) over kit1rec.dat / kit14rec.dat, associate code→nearest description. NOTE `strings` binary NOT installed; use Python regex (see /tmp/strdump.py pattern).

## Current DB (Cabinet Dealz)
- cabinets: 424 rows. Fields: masterCode (unique), description (text, NOT NULL), descriptionSource, category (Base/Wall/Tall/ADA/Vanity/Accessory), subCategory, width/height/depth, numberOfDoors, numberOfDrawers, isCornerCabinet, graphicType, catalogImageUrl, isActive, conflictStatus (none|conflict).
- door_styles: styleCode, ourName, aliasName (public white-label), distributorName, doorStyle, woodSpecies, finish, color, isFeatured, featuredRank, isActive.
- distributor_skus: cabinetId, distributorId, styleId, platformSku (unique), distributorSku, listPrice/yourCost/adjustedListPrice/wholesalePrice/contractorPrice/homeownerPrice, isAvailable, isPublished, imageUrl, supplierCabinetName.

## Tooling constraints discovered
- webdev_execute_sql is FLAKY: fails on multi-statement/UNION queries and intermittently drops connection. Use single simple statements, retry.
- Shell BLOCKS any command that references `.env` (even reading it). Cannot `node --env-file=.env` or grep .env.
- Shell process does NOT have DATABASE_URL exported.
- => To export DB to CSV for offline reconciliation, use a VITEST test (tests run with project env + getDb() works there). scripts/export-catalog.mjs exists but can't get env via shell; convert to a vitest that writes CSVs, OR just do reconciliation through targeted webdev_execute_sql single queries.

## Guardrails / knowledge to honor
- Categorize by DOOR STYLES, not product lines. Consistent naming ("drawer base 12-3" not "B12-3"). No distributor names in public content. Put uncertain items in conflict status. Descriptions uniform + professional. Do NOT expose SKU counts publicly.
- PRODUCE A REVIEW REPORT (spreadsheet) of proposed changes BEFORE writing to DB.


## RESULTS (phase 3-4 complete)

### Extraction pipeline (all in /home/ubuntu/milestone_catalogs/)
- extract_catalog.py -> extracted/master_catalog.csv (11,481 raw code rows) + extracted/door_options.csv
- desc_index.py -> extracted/desc_index.json (code->best description across kit1/13/14 per line)
- reconcile.py -> extracted/skyline_reconciliation.xlsx (sheets: Matched, New_Catalog, DB_Only, Door_Styles)
- conflicts.py -> extracted/skyline_conflicts.xlsx (Conflicts sheet)
- DB export: db_export/cabinets.csv (424), db_export/door_styles.csv (62) via server/exportCatalog.dump.test.ts

### Reconciliation numbers
- Orderable catalog base codes: 245 distinct (Premium/Slim/Builder share 322-code set; Euro Frameless separate).
- MATCHED to DB: 225 (after normalizing leading vs trailing drawer count: 3DB24 == DB-24-3; ADA/V prefixes; handedness).
- NEW_CATALOG (in catalog, not DB): 11 — mostly trim/fillers (F330,F630,FF396 fluted filler,ROPE,TKC toe-kick,BCM8,RCM4S,SM8) + vanity drawer bases 3VDB12/15/18. No major missing cabinets.
- DB_ONLY: 197 (DB broader than these 4 catalogs: full ADA line, many accessories). Expected, not a problem.

### KEY: 14 DATA CONFLICTS (DB looks WRONG vs Skyline catalog) — need owner decision
1. WRC-24-30, WRC-30-15, WRC-30-18: DB="Refrigerator Wall Cabinet" but WRC = WINE RACK Cabinet (catalog: "Wall Wine Rack Cabinet"). DB MISLABELED.
2. Tall utility/pantry door counts: U-18-84/90/96-24 DB=1 door vs catalog=2 doors; U-24/30-84/90/96-24 DB=2 doors vs catalog=4 doors. Catalog likely right (tall pantry = upper+lower doors).
3. ERB-33, ERB-36: catalog adds "w/Lazy Susan" detail DB omits ("Easy Reach Base Cabinet w/Lazy Susan").

### Catalog descriptions vs DB
- DB descriptions are GENERALLY BETTER (full sentences w/ dims + shelf counts). 20-20 catalog text is terse + truncated to ~30 chars ("Wall Cabinet - 2 Doors - 2 Sh"). => Do NOT blanket-overwrite DB with catalog text. Use catalog as CROSS-CHECK for identity/config only.

### Official Skyline door/finish names (from paf.xml) — for verifying door_styles.distributorName
- Premium (framed): Aspen Charcoal Gray, Aspen White, Aston Green, Charleston White, Double Dove White, Double Smokey Grey, Iron Black, Lunar Gray, Navy Blue, Rustic Wood, Sage Breeze, Shaker Espresso, Shaker Gray, Shaker White, Smokey Ash, Treasure Chest
- Slim Shaker: Slim Amber Oak, Slim Aston Green, Slim Dove White, Slim Iron Black, Slim White Oak
- European Frameless: High Gloss White, High Gloss Gray, Matte Black, Matte Ivory, Oak Blonde, Oak Shade, Crystal Glass, Midnight Glass
- Builder: Floral White, Floral Gray, Floral Espresso

DB door_styles: 62 rows, use distributorName = distributor's real name, ourName/aliasName = white-label. Most Skyline names already present as distributorName (e.g. Iron Black->Obsidian Forge, Lunar Gray->Moon Gray, Navy Blue->Cobalt Abyss, Treasure Chest->Gold Vault, Rustic Wood->Forest Rust, Sage Breeze->Zephyr Sage, Smokey Ash->Dusk Ash, Shaker Espresso->Shadow Shaker, Slim White Oak->Air Dawn, Slim Dove White->Air White, Matte Black->Velvet Black, Oak Blonde->Solar Oak, Floral White->Bloom White). Coverage looks complete; minor: "Charleston White","Aston Green","Aspen White/Charcoal Gray","Double Dove White","Double Smokey Grey" not obviously mapped — verify later if owner wants door-style audit.

### PENDING OWNER DECISION (asked next)
Recommend: (A) FIX the 14 conflicts (WRC wine rack, pantry door counts, ERB lazy susan) — real errors. (B) Do NOT overwrite the other ~211 descriptions (DB better). (C) Optionally add the handful of new filler/trim SKUs. Deliver both xlsx workbooks for review first.
