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

- [x] Audit what fields are refreshed when an existing product is re-imported via 20/20 catalog
- [x] Update path already refreshes: description, category, placementType, width, height, depth, numberOfDoors, numberOfDrawers, cabinetStyle, productType, catalogImageUrl (if empty) — no changes needed
- [x] Deploy and confirm — no code changes required

## Elevation View Cabinet Borders

- [x] Find the elevation renderer code that draws cabinet borders/frames — outer box has border:none; the "border" was the black horizontal rail line from fake drawer bands
- [x] Remove the unwanted border outlines — fixed in v69d41372: numberOfDrawers=0 override eliminates fake drawer rail lines on plain door cabinets
- [x] Deploy and confirm — deployed in v69d41372

## Tall Cabinet 2D Rendering Fix

- [x] Identify root cause: FrontByType switch had no case for "pantry" or "oven-tall" — both fell through to StandardDoorFront which rendered a single door with a top drawer band (the "drawer front border")
- [x] Add PantryFront renderer: outer box split into 2 stacked door sections at ~54% height, each with 1 or 2 side-by-side doors (2 for wide >= 24"), no drawer band, horizontal divider line, door knobs on meeting-stile edges
- [x] Add OvenTallFront renderer: 2 upper doors + appliance opening (grey dashed cavity, single or double oven) + lower drawer fronts with bar pulls
- [x] Wire both into FrontByType switch (case "pantry" and case "oven-tall")
- [x] TypeScript check passes with no errors

## Import Completion Email Notification

- [x] Add sendImportNotification helper to catalogImport.ts — sends to 7809tom@gmail.com using DB-backed SMTP settings (falls back to env SMTP)
- [x] Wire success notification in executeImport: file name, distributor ID, Created/Updated/Skipped/Errors counts
- [x] Wire failure notification in executeImport: file name, distributor ID, error message
- [x] Real file name loaded from catalogImports DB record (importId lookup) and passed to both success and failure notifications
- [x] Save checkpoint and deploy

## Elevation View Rendering Fixes

- [x] Fix missing toe kick on base cabinets in elevation view — fixed in v69d41372: toe kick applies to ALL base/tall cabinets where rawBottom < 4.5"
- [x] Fix 2-drawer base (2DB) showing uneven drawers — fixed in va33dd191: equal-height 50/50 split
- [x] Investigate Hickory door style frame appearance — Hickory uses standard shaker door style; per-style frame inset from stileWidth was added in va33dd191

## Hide Merged/Aliased Cabinets from Admin Cabinet List

- [x] Research: confirmed skuMasterAliases.aliasCode stores the merged-away cabinet's masterCode
- [x] Add NOT IN (SELECT aliasCode FROM sku_master_aliases) filter to adminListCabinetConfig procedure
- [x] TypeScript check passes — no errors
- [x] Save checkpoint and deploy

## Pricing Bug: Estimate & Build Sheet and Cart show list price instead of tier price

- [x] Traced: priceForCabinetsByStyles in design.ts was returning raw stored columns (homeownerPrice=NULL for most SKUs) instead of computed tier prices
- [x] Root cause: missing yourCost in select + missing sellPriceForTier call in priceForCabinetsByStyles
- [x] Fix: added yourCost to select, added sellPriceForTier(r, ps, tier) computation before return — matches rollOutTraysForStyles pattern
- [x] TypeScript check passes — no errors
- [x] Save checkpoint and deploy
- [x] Save checkpoint and deploy

## Door Style Persistence + Tier Pricing Consistency

- [x] Audited: door style passes via ?style= URL param from Family → CabinetDetail (already working)
- [x] Audited: viewer tier uses resolveStorefrontTier(user) on CabinetDetail, Family, and now Cart
- [x] Door style persistence confirmed: Family links include ?style={styleId}, CabinetDetail pre-selects it
- [x] Tier pricing: design tool auto-syncs tier from user.pricingTier on login (existing code)
- [x] Cart: added priceForCartItems server procedure + live price lookup in Cart page using viewer's current tier
- [x] Cart: order summary now shows "Pricing tier" label (homeowner/contractor/wholesale)
- [x] Cart: liveSubtotal computed from live tier prices, not stale stored unitPrice
- [x] Save checkpoint and deploy
- [x] Security: priceForCartItems gates prices by viewer tier using visiblePricesForViewer
- [x] Save checkpoint and deploy

## Edit Config — Desktop Designer Fix

- [x] Root cause: Edit Config link only existed in mobile sheet (isMobile branch), not in desktop toolbar
- [x] Added Edit Config link to desktop cabinet toolbar (same amber style as mobile)
- [x] Added ?edit=1 URL param to both mobile and desktop Edit Config links
- [x] CabinetDetail auto-opens edit dialog when ?edit=1 is in URL and user is admin (useEffect after auth loads)
- [x] Save checkpoint and deploy

## LTL Freight Broker API Integration

- [x] Research Freightquote, GlobalTranz, Worldwide Express API docs and auth patterns
- [x] Add freight_broker_settings table to DB schema
- [x] Add Freight Broker section to Admin Shipping Settings UI
- [x] Build ShippingCarrierService server module with clients for all 3 brokers
- [x] Build payload assembler: origin ZIP, dest ZIP, address type, weight, dimensions, NMFC class, accessorials
- [x] Wire live rate endpoint into checkout/cart ZIP check
- [x] Add fallback: flat rate or "contact us" if API times out or errors
- [x] Log API call payloads and responses in admin log table
- [x] Save checkpoint and deploy

## Affiliate Save Not Persisting (admin panel + affiliate dashboard)

- [x] Diagnose why branding saves do not persist from both save paths
- [x] Confirmed server-side writes were always correct (7 persistence tests pass)
- [x] Root cause 1: admins hit updateMyStorefront, which fell back to the FIRST affiliate row — edits landed on the wrong store
- [x] Root cause 2: both forms initialized state once on mount and never re-synced, so saved values looked reverted
- [x] Root cause 3: onSaved refetched myRef, which is disabled for admins — admin views stayed stale
- [x] Fix 1: updateMyStorefront accepts an optional affiliateId, honored only for admins, validated against the table
- [x] Fix 2: CustomizeTab re-syncs form state on affiliate id/updatedAt change; admin editor re-syncs on fresh data
- [x] Fix 3: save invalidates myReferrals/adminReferrals/adminList/bySlug and refetches the ACTIVE query
- [x] Fix 4: added storeName to the affiliate-editable fields (text logo support)
- [x] Crash fix: replaced empty-string SelectItem values in font dropdowns (Radix throws → white screen)
- [x] Crash fix: same empty SelectItem issue fixed in DistributorImport
- [x] Added native color pickers for primary/accent color
- [x] Added Store display name field to Brand Identity
- [x] Added vitest coverage: 7 tests in server/affiliates.savePersist.test.ts (incl. admin targeting + rejection of unknown id)
- [x] All 29 existing affiliate tests still pass; TypeScript clean; production build succeeds
- [x] Save checkpoint and deploy
