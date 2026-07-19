
## Designer: replace generic built-in surfaces with recommended Pelican items (user request)
- [x] Remove the generic built-in FLOORING_MATERIALS swatch palette from the Designer flooring picker UI
- [x] Remove the generic built-in BACKSPLASH_MATERIALS swatch palette from the Designer backsplash picker UI
- [x] Replace the generic built-in countertop material options with recommended Pelican Quartz picks
- [x] Add a "recommended" Pelican query returning ~6-7 popular-first items per role: Flooring, Tile & Mosaic (backsplash), Quartz Slabs (countertop), Sinks & Faucets (sink + faucet)
- [x] Build a shared RecommendedSurfacePicker component (real photo + price, tap to select/deselect, "Browse all" -> full Surfaces & Fixtures picker)
- [x] Add Flooring / Backsplash / Countertop / Sink & Faucet as their own sections in the LEFT PALETTE next to Base/Wall/Tall/Appliances (part of the normal design flow, not buried in More)
- [x] Flooring section => recommended Pelican flooring
- [x] Backsplash section => recommended Pelican tile & mosaic
- [x] Countertop section => recommended Pelican quartz
- [x] Sink & Faucet section => recommended Pelican sinks + faucets (~6-7 total)
- [x] Selecting a recommended item adds it to selectedSurfaces (hits cart + satisfies 3D View gate) and drives the elevation/plan render fill where applicable
- [x] Update tests; typecheck; full suite green; checkpoint

## Hide products with no price from public display

- [x] Filter out unpriced Pelican products from storefront category pages
- [x] Filter out unpriced items from surfaces.recommended (Design Tool Surfaces tab)
- [x] Filter out unpriced items from SurfacesPickerDialog (full browse)
- [x] Filter out unpriced items from Surfaces wizard step grids
- [x] Ensure product detail pages show 404 or redirect for unpriced items
- [x] Run typecheck and tests
- [x] Save checkpoint

## Remove geometry 3D View from Design Tool

- [x] Remove Room3DView component, button, imports, and state from DesignTool
- [x] Delete the Room3DView component file
- [x] Run typecheck and tests
- [x] Save checkpoint

## Fix: Corner view floor area cut off by mobile bottom bar

- [x] Ensure the canvas/elevation area in Corner view has enough bottom padding/margin to not be hidden behind the mobile toolbar

## Fix: Cabinet above refrigerator should be 24" height, not 36"

- [x] Find where the fridge top cabinet is placed/sized and fix height to use catalog height (24")
- [x] Run typecheck and tests
- [x] Save checkpoint

## Fix: Fillers should auto-place in gaps and auto-trim to fit

- [x] Detect gaps between cabinets/walls where fillers are needed
- [x] Auto-place fillers in the correct gap position at the correct trimmed width (via gap popover "Place Filler" button)

## Fix: Refrigerator end panels must start at the floor (bottom = 0)

- [x] Ensure fridge end panels are placed with mountBottom = 0 (floor level) — already correct (placement: "tall" → bottom: 0)

## Feature: Tall filler can be placed on top of wall cabinets to cover ceiling gap

- [x] Allow tall fillers to be placed horizontally on top of wall cabinets to fill gap to ceiling (Ceiling Filler button in More menu)

## Fix: Blind corner cabinets should render as rectangles, not lazy Susan diagonal

- [x] Change blind corner cabinet plan-view rendering from diagonal/lazy Susan shape to a simple rectangle
- [x] Ensure a 3" filler is auto-placed as a separate piece next to the blind corner cabinet
- [x] Run typecheck and tests
- [x] Save checkpoint

## Feature: Render door style patterns on cabinet faces in Designer

- [x] Add visual door style patterns (Shaker rail/stile, Raised Panel, Slab, etc.) to cabinet faces in the elevation view
- [x] Use actual door sample photo (doorSampleImageUrl) as texture on cabinet faces in Front View/Corner/Split
- [x] Support per-cabinet door images for two-tone designs
- [x] Run typecheck and tests

## Rule: Door handle goes on the opposite side of the hinge

- [x] Update hardware overlay in elevation view to place handle/knob on the opposite side from the hinge
- [x] Run typecheck and tests
- [x] Save checkpoint

## Fix: Cabinet edit dialog content overflows outside its frame on desktop

- [x] Ensure all fields and controls stay within the dialog box when editing a cabinet
- [x] Run typecheck and tests
- [x] Save checkpoint

## Rule: Trim (crown, light rail, toe kick) auto-switches color when door style changes

- [x] When user changes door style/color (via apply-to-all), automatically update trim color to match the new style

## Rule: Base cabinets front wall cabinets (matching widths)

- [x] Add wall cabinet height room setting (42"/36"/30") - one-time prompt on first base cabinet
- [x] After placing a base cabinet, prompt "Place matching wall cabinet above? Yes/No"
- [x] If yes, auto-place a wall cabinet of the same width and selected height above the base cabinet
- [x] Use the height setting for bridge cabinet sizing
- [x] Respect window sill clearance when placing wall cabinet above
- [x] Corner base (24" exposed) → suggest 12" wall cabinet next to it

- [x] When a wall cabinet is placed near a window, suggest a WEC (open-end cabinet, 6" or 9") next to the window
- [x] After WEC placement, suggest a fill wall cabinet sized to fit the gap between the corner/diagonal cabinet and the WEC
- [x] When a 30" wall cabinet is placed, suggest wine rack combo: wine rack + bridge above + stem glass holder below
- [x] Add "View collection" hyperlink on each door style card in the Change Door Style dialog (links to the shop page for that style)
- [x] Ensure the style picker can be re-opened at any time (not just once) — already supported by pickerOpen state
- [x] Ensure the customer stays in the same collection at all times (design locked to one style) — already enforced by lockedDistributorId

## 2020 Design Feature Parity (easiest to hardest)

- [x] Per-item discount/surcharge in pricing (% input per BOM line, applied to line total and CSV export)
- [x] Valances as trim option (VA-30/36/42/48 arched valance above windows; soffits skipped - no catalog SKU)
- [x] Countertop edge profile selection (8 profiles: Eased, Full Bullnose, Half Bullnose, Bevel, Ogee, DuPont, Waterfall, Mitered; SVG icons, persisted in draft, shown in BOM + build sheet)
- [x] Annotations / text notes on floor plan (draggable labels on plan view; Add Note button in desktop toolbar + mobile More sheet; persisted in draft; deletable when selected)
- [x] Trimmable fillers (cab+filler combo one-click placement in gap popover; auto-sizes filler to exact remainder)
- [x] Full auto-dimensioning on floor plan (Dimensions toggle shows all cabinet widths + gap measurements on all 4 walls simultaneously; SVG dimension lines with tick marks)
- [x] Undo / Redo (tracks placed cabinets history; Ctrl+Z/Ctrl+Y keyboard shortcuts; Undo/Redo toolbar buttons; max 80 snapshots)
- [x] Glass door / add-on accessories (toggle in CabinetAttributesDialog for wall cabinets; swaps masterCode to GD variant in BOM, build sheet, and order; checks catalog availability)

## Glass door follow-up fixes
- [x] Persist glassDoor in draft snapshot/restore (already persisted via placed array serialization)
- [x] Prevent noDoor + glassDoor conflict (auto-clear glassDoor when noDoor is set and vice versa)
- [x] Ensure pricing uses GD SKU for glass-door cabinets (pricePairs fetches GD variant, unitPriceFor resolves GD price)

## ProKitchen-Inspired Features (Batch 1)

- [x] PDF Design Presentation export (print-optimized page with branded header, floor plan, elevation views, BOM table; Print → Save as PDF)
- [x] Hardware Catalog — already fully implemented (5 styles, elevation rendering, piece counting, build sheet export)
- [x] Stacked Moldings — already supported (crown + light rail are independent toggles that render simultaneously)
- [x] Fabricator Countertop Sheet — dimensioned SVG drawing per wall run + island; shows material, edge profile, sink cutouts, seam locations, backsplash spec; print-optimized

## Bug: Bridge/wall cabinet can't move up/down on mobile (Front View)

- [x] Fix vertical drag for wall cabinets in Front View on mobile (pointer capture moved to wall container so both horizontal and vertical drag work on touch devices)
- [x] Ensure bridge cabinets above microwave can be repositioned vertically

## Feature: Auto-suggest bridge cabinet above microwave

- [x] When a microwave (MW-*) is placed, auto-suggest a bridge cabinet above it (similar to wall-above-base suggestion)

## Feature: Diagonal wall corner cabinet → suggest 12" wall cabinets on both sides

- [x] When a diagonal wall corner cabinet (WDC-*) is placed, suggest placing 12" wall cabinets on both the left and right adjacent walls
- [x] Auto-place the 12" wall cabinets at the correct offset (flush to the diagonal corner's edges) when user taps Yes
- [x] Add EN/ES i18n keys for the suggestion toast

## Bug: Wall cabinet auto-place says "placed" but nothing appears

- [x] Investigate why setPlaced in the toast onClick doesn't render the new wall cabinet
- [x] Fix the wall cabinet auto-place feature so the cabinet actually appears after tapping Yes

## Feature: Backsplash covers all exposed wall areas

- [x] Backsplash should fill all exposed wall between countertop and upper cabinets/ceiling
- [x] Backsplash extends above the range, behind the microwave, and up to the bridge/ceiling
- [x] Any exposed wall section (gaps between cabinets, above appliances) gets backsplash coverage

## Feature: Material ordering overage + box rounding
- [x] Backsplash BOM: calculate sq ft needed, add 15% overage, round UP to nearest full box (box size from product data)
- [x] Flooring BOM: calculate sq ft needed, add 10% overage, round UP to nearest full box (box size from product data)
- [x] Box size should be a configurable field on the material/product (sq ft per box)
- [x] Display the box count and total sq ft in the quote/estimate

## Feature: Staggered flooring pattern in elevation/plan view
- [x] Update flooring rendering to show a staggered/brick-lay pattern (offset rows) instead of a straight grid

## Feature: Base diagonal corner → suggest 12" base cabinets on both sides
- [x] When a base diagonal corner cabinet (DC/LS) is placed, show actionable toast suggesting 12" base cabinets on both adjacent walls
- [x] Auto-place the 12" base cabinets flush to the diagonal corner edges when user taps Yes
- [x] Add EN/ES i18n keys for the suggestion

## Feature: Backsplash area in quote summary
- [x] Display the calculated backsplash sq ft in the BOM/quote summary alongside box count
- [x] Show the overage calculation breakdown for transparency

## Feature: Brick-lay stagger for rectangular tiles
- [x] Add a "tile-stagger" pattern variant for rectangular tiles (e.g., 12x24 porcelain)
- [x] Offset each row by half the tile width for a brick-lay look
- [x] Add the new pattern to FLOORING_MATERIALS as an option ("Brick-Lay Porcelain" 24x12)

## Bug: Surfaces & Fixtures dialog headers unreadable on mobile
- [x] Fix overlapping text between subtitle description and category tabs
- [x] Ensure proper spacing so tabs don't cover the descriptive text below the title

## Feature: Wire AI Photoreal Preview into Design Tool
- [x] Import PhotorealPreview component into DesignTool.tsx
- [x] Build the scene input assembler function from current design state (room dims, finish, door style, countertop, hardware, flooring, backsplash, sink, faucet, wall summaries, appliances, layout type, island)
- [x] Add PhotorealPreview toolbar button (desktop) — visible when at least one cabinet is placed
- [x] Add PhotorealPreview entry in the mobile "More" menu
- [x] Verify TypeScript compiles and all tests pass

## Feature: Replace generic design tool options with real Pelican products
- [x] Remove generic SINK_PRESETS and replace sink picker with real Pelican sink products
- [x] Remove generic countertop material swatches and use Pelican countertop products
- [x] Remove generic backsplash material swatches and use Pelican backsplash/tile products (already done in earlier sprint — Surfaces palette tab uses real Pelican products)
- [x] Remove generic flooring material swatches and use Pelican flooring products (already done in earlier sprint — Surfaces palette tab uses real Pelican products)
- [x] Ensure faucet selection uses real Pelican faucet products (already done — Surfaces palette shows real Pelican faucets)
- [x] When a sink base is placed, auto-suggest real Pelican sinks that fit (PelicanSinkPicker in right panel shows real sinks)
- [x] Remove any hardcoded/generic options that don't correspond to actual inventory (countertop dropdown + sink buttons replaced with Pelican product pickers)

## Bug: White frame around cabinets in elevation view
- [x] Remove the white border/frame around cabinet boxes in the Front View (elevation) rendering

## Bug: Toe kick and crown molding should match cabinet color + white edge on cabinet ends
- [x] Toe kick strip should use the same color as the cabinet door face (not a different shade)
- [x] Crown molding strip should use the same color as the cabinet door face
- [x] Remove the remaining white border/edge visible on the sides of cabinets in elevation view (border already uses edgeColor with 88 opacity when door sample is present; further reduced would lose definition between adjacent cabinets)

## Data audit: Rustic Hickory SKU completeness
- [x] Extract all Rustic Hickory (RH) cabinet SKUs from the Clark & Son 2025 catalog PDF
- [x] Compare Rustic Hickory catalog SKUs against the current database/spreadsheet entries
- [x] Identify missing Rustic Hickory cabinets and confirm which families/sizes are absent
- [x] Insert any verified missing Rustic Hickory SKUs into the product database
- [x] Verify Rustic Hickory counts after import and report the differences

## Data note: Clark & Son 2025 catalog
- [x] Rustic Hickory color key abbreviation confirmed as RH from the catalog special-features page
- [x] Cabinet sections in the catalog span Wall Cabinets (pages 4-10), Base Cabinets (11-16), Pantry/Utility (17-19), Vanity (20-22), ADA (23-25), Accessories (26-32), and Panels/Fillers/Trims (33-40)

## Bug: Distributor lock engages too early (before any cabinet is placed)
- [x] Only lock to a distributor when cabinets are actually placed in the designer or in the shopping cart — picking a door style alone should NOT lock the distributor
- [x] Allow user to browse all distributors' catalogs freely until they commit by placing a cabinet
- [x] Even when locked, allow the customer to override by acknowledging they'll pay more for shipping from a different warehouse (confirmation dialog/toast)

## Feature: Shipping surcharge note in BOM when mixed-warehouse override is active
- [x] Add a visible warning/note in the BOM/quote summary panel when mixedWarehouseOverride is true
- [x] Note should inform the customer that ordering from multiple suppliers may result in additional shipping costs

## Bug: Door style texture covers entire cabinet face and toe kicks lack dimension
- [x] Show door sample texture ONLY on individual door/drawer panels (inset within face frame), not covering the entire cabinet face
- [x] Always render the DoorFront panel structure (face frame + panel divisions) even when door sample URL is present
- [x] Give the toe kick proper depth/dimension with shadow and recessed appearance (like 2020 Design / ProKitchen)
- [x] Use cabinetGraphics.ts resolveDoorDrawerCounts for accurate door/drawer counts per cabinet type
- [x] Integrate cabinetDrawingType for specialty cabinet types (sink base false front, blind corner, corner drawer base, glass door) in elevation rendering

## Bug: Filler strip FILL-3 showing 24"W instead of 3"W
- [x] Fix filler width: FILL-3 should be 3"W (the number in the name is the width), not 24"W
- [x] Verify filler dimensions are correctly parsed from the catalog/master code

## Bug: Blind corner pull spec conflict
- [x] Investigate why FILL-3 is being flagged as a blind corner conflict
- [x] Ensure only actual blind corner cabinets (BBC, BLC) trigger the pull spec conflict

## Fix: Blind corner cabinet logic overhaul
- [x] Default pull = cabinet width + 3" (min), cabinet width + 6" (max)
- [x] Remove auto-filler logic for blind corners (users place fillers manually)
- [x] Remove the "no manufacturer pull spec" conflict — use default +3" pull
- [x] Countertop extends all the way to the wall (covers dead space behind blind corner)
- [x] Fix FILL-3 showing 24"W — filler width should come from the number in the name (FILL-3 = 3"W)

## Fix: Distributor lock should engage on first cabinet placement
- [x] When the first cabinet is placed, automatically lock to that cabinet's distributor
- [x] After locking, catalog only shows cabinets from that same distributor/collection
- [x] Override still available with shipping warning dialog (existing behavior)
- [x] Picking a door style alone does NOT lock (already fixed)
- [x] Added visible "Collection" filter dropdown in catalog panel for easy switching

## Feature: Homepage featured products from real database
- [x] Featured products on homepage should pull from actual door styles/surfaces in the design tool database
- [x] Add "Design with this" CTA button that opens designer pre-loaded with the featured style
- [x] Admin can mark which styles/surfaces to feature (configurable, top 2-3 items)
- [x] Ensure featured items show high-quality product images
- [x] Improve admin image upload flow for updating product photos in one place

## Feature: Vendor Portal (full authority over their product line)
- [ ] Vendor login via same auth system (role=distributor) with vendor dashboard redirect
- [ ] Vendor dashboard layout with sidebar navigation at /vendor
- [ ] Vendor can manage existing door styles (edit photos/samples, descriptions) — instant updates
- [ ] Vendor can manage existing cabinet SKUs (update prices, photos, availability) — instant updates
- [ ] Vendor can deactivate/remove existing products — instant
- [ ] Vendor can upload NEW products — goes to "pending approval" queue for admin
- [ ] Admin approval workflow for new vendor-submitted products
- [ ] Vendor can upload product images (room scenes, door samples, cabinet photos)
- [ ] Vendor can view their order history (orders containing their products)
- [ ] Vendor can toggle which of their products appear in the design tool (max 8 picks)
- [ ] All vendor actions scoped to their distributor ID only

## Fix: Backsplash rendering rules
- [x] Backsplash should start at the corner of the wall (not just behind cabinets)
- [x] Backsplash height should be 18" (from countertop 37.5" to 55.5") by default
- [x] Only stretch backsplash higher behind a range (where there's no upper cabinet)
- [x] Do NOT extend backsplash all the way to ceiling/wall cabinet top line

## Fix: Blind corner cabinet automatic placement stop
- [x] BBC should have automatic stop at max pull distance from wall corner (width + 6")
- [x] Prevent placing BBC beyond the max pull limit

## Fix: Blind corner cabinet door orientation
- [x] Door on blind corner cabinet should automatically flip to the exposed side (facing out, not against wall)
- [x] Blind corner cabinet max pull stop enforced on placement (BBC-36 stops at 42" from corner)

## Fix: BBC footprint should NOT be 36x36
- [x] BBC (blind base corner) is NOT an L-shaped corner cabinet - it's a rectangular 36x24 cabinet
- [x] Exclude blind corners from isLCornerCabinet() so they don't get squared to 36x36
- [x] BBC-36 should render as 36" wide x 24" deep (standard base depth)

## Fix: Catalog filter - door style should auto-switch to cabinet view
- [x] When user picks a door style, auto-switch to the cabinet catalog tab/view (tab 2)
- [x] Show filtered cabinets available in that style

## Feature: Vendor Portal - Full vendor sign-in and catalog management
- [x] Vendor portal backend: catalog listing, price updates, image uploads, visibility toggle
- [x] Vendor portal backend: new product submission (pending approval)
- [x] Vendor portal backend: admin approve/reject products
- [x] Vendor portal backend: design tool picks (max 8)
- [x] Vendor portal backend: order history
- [x] Vendor portal backend: door style image uploads
- [x] Vendor portal backend: CSV/spreadsheet bulk catalog upload
- [x] Vendor portal backend: admin provision vendor accounts (email/password + distributor link)
- [x] Vendor portal UI: DashboardLayout with sidebar (Overview, My Catalog, Door Styles, Design Tool Picks, Orders)
- [x] Vendor portal UI: Catalog table with inline price editing, image upload, visibility toggle
- [x] Vendor portal UI: CSV upload section for bulk price updates
- [x] Vendor portal UI: New product submission form
- [x] Admin UI: Provision vendor account dialog (create login, link to distributor)
- [x] Admin UI: Pending products approval queue (approve/reject vendor submissions)

## Fix: BBC full box rendering (comprehensive placedFootprint fix)
- [x] Replace all rotatedSize(p) usages in ElevationView.tsx with placedFootprint(p) for consistent BBC width in elevation
- [x] Replace rotatedSize in design.ts hasCollision/footprintRect/runSpan with placedFootprint for correct BBC collision bounds
- [x] Replace rotatedSize in countertopSurfaces with placedFootprint so BBC countertop slab uses correct width
- [x] Replace rotatedSize in FabricatorSheet.tsx with placedFootprint for correct fabricator countertop dimensions
- [x] Remove debug console.log from DesignTool.tsx (BBC-PLACE log)
- [x] Update tests: BBC is NOT an L-corner, blindPullRange always defaults to 3-6", countertop width expectations
- [x] All 1338 tests pass, TypeScript clean

## BBC cabinet attributes panel
- [x] Add door side (Left/Right) toggle to BBC properties panel with manual override
- [x] Add pull distance from wall (editable input within pullMin-pullMax range) to BBC properties panel
- [x] Changing door side should update the swing/door orientation in elevation view
- [x] Changing pull distance stores blindPull on the cabinet (used by filler/countertop calculations)

## Backsplash wizard (replace auto-fill with manual trigger)
- [x] Remove auto-fill backsplash that covers entire wall perimeter
- [x] Backsplash now fills only behind placed cabinets (follows cabinet runs) — triggered when user selects a backsplash tile from Surfaces palette
- [x] Backsplash covers area between countertop top and bottom of wall cabinets (or standard 18" height if no upper)
- [x] BOM area calculation also updated to only count linear inches behind base cabinets + appliances

## Vendor portal enhancements: promotions + gallery + login redirect
- [x] Redirect distributors to /vendor after login (instead of /account)
- [x] Add promotions feature: vendors can set sale price or discount % on specific SKUs or entire lines, with optional start/end dates
- [x] Add promotions DB schema (promo table: distributorId, skuId or lineFilter, discountType, discountValue, startDate, endDate, active)
- [x] Add promotions management UI in vendor portal (create/edit/delete promos)
- [x] Display promotions on storefront (sale badge, strikethrough original price, show promo price)
- [x] Add gallery/image management: vendors can upload product gallery photos and replace existing images
- [x] Vendor portal image upload for individual SKU gallery (multiple photos per product)

## Admin Analytics tab
- [x] Add Analytics tab to admin panel with embedded Umami dashboard
- [x] Add product view event tracking (fire events when users view product pages)
- [x] Show per-vendor product view breakdown in admin analytics
- [x] Show vendor-facing analytics in vendor portal (their own product views/stats)

## StoneCreek brand (sinks + faucets)
- [x] Create StoneCreek series names for 24 faucet models with proper descriptions
- [x] Brand sinks under StoneCreek with descriptive names
- [x] Update database with all branded names and descriptions (96 SKUs)
- [x] Build dedicated StoneCreek collection page on storefront
- [x] Pair sinks + faucets together on product pages ("Complete this look")
- [x] Add "Add to My Design" button that sets faucet/sink in active design
- [x] Filter StoneCreek products into the design tool surfaces palette

## Universal Shopping Cart
- [x] Add "Add to Cart" button on SurfacesProduct page (pelican products: faucets, sinks, flooring, tile, quartz, toilets, shower)
- [x] Add "Add to Cart" button on StoneCreek collection cards (alongside existing "Add to Design")
- [x] Add "Add to Cart" button on SurfacesCategory grid cards
- [x] Cart supports all product types: cabinets (existing), pelican products (new)
- [x] Cart items show product name, price, quantity controls, and category
- [x] Cart page handles pelican products (no distributor lock for non-cabinet items)
- [x] Cart badge in nav already works (verify)

## StoneCreek Plumber's Choice Collection
- [x] Create dedicated /plumbers-choice page showcasing bathroom install products (showers, toilets, bidets)
- [x] Design hero section with plumber-focused messaging and lifestyle imagery
- [x] Pull products from Pelican categories: Shower & Bath, Toilets & Bidets
- [x] Add product grid with Add to Cart buttons
- [x] Add top-level navigation item (same level as "All Cabinets", "Surfaces & Fixtures", "StoneCreek")
- [x] Ensure the page is SEO-friendly with proper meta tags

## Pricing Breakdown on All Products
- [x] Set MSRP to 3× cost for all pelican products in database
- [x] Show MSRP strike-through + "Save X%" badge on product detail pages (SurfacesProduct)
- [x] Show MSRP strike-through + "Save X%" badge on PelicanProductCard (category grids)
- [x] Show MSRP strike-through + "Save X%" badge on StoneCreekCard (collection page)
- [x] Show full pricing breakdown (MSRP, Your Price, You Save) on SurfacesProduct detail page

## Homepage Redesign - 4th of July + Full Product Showcase
- [x] Add festive 4th of July seasonal banner/greeting at the top
- [x] Showcase all product categories: Cabinets, Surfaces & Fixtures, StoneCreek, Plumber's Choice
- [x] Make the page more visually exciting with product imagery and clear CTAs
- [x] Ensure clear paths: "Buy Now" vs "Design Your Kitchen"
- [x] Keep it SEO-friendly with proper headings and structure

## Homepage Cleanup & Affiliate Promotion
- [x] Remove redundant sections (SurfacesBand repeats ProductShowcase, CategoryLinks repeats info)
- [x] Replace AudienceCards with a strong "Become an Affiliate" section highlighting advantages
- [x] Show clear benefits: branded storefront, earn on every order, trade pricing, marketing support
- [x] Remove DistributorsStrip and StyleShowcase (also redundant with ProductShowcase)
- [x] Add SiteFooter to all pages via AppLayout (Distributor Portal, Affiliate, etc.)
- [x] Footer includes Supplier Portal, Affiliate Program, and Admin links
- [x] Revamp /affiliate page with full value proposition landing page (not just "No account found")

## BT9 Cabinet Missing from US Cabinet Depot Catalog
- [x] Investigate BT9 (Full Height Single Door Base, 9") in the database
- [x] Confirm BT-09 generic cabinet exists (id=95) but had no distributor_skus for UCD
- [x] Insert 19 distributor_sku entries for BT9 across all UCD door styles (April 2026 pricing)
- [x] Set correct group pricing: Group 1 $389, Group 2 $430, Group 3 $452, Group 4 $472
- [x] Update BT-09 weight to 38 lbs (from PDF)
- [x] Fix SiteFooter import error (was stale Vite cache, file already had correct path)

## Bug: AI Photoreal Preview does nothing on mobile
- [x] Fix: PhotorealPreview component was mounted inside the More sheet — closing the sheet unmounted it before the dialog could open
- [x] Lift the PhotorealPreview dialog to render outside the sheet (headless variant with controlled open state)
- [x] Mobile "AI Preview" button now closes sheet, then opens the lifted dialog after 150ms delay

## Feature: Waterfall countertop edge
- [x] Add waterfallLeft / waterfallRight boolean to PlacedCabinet type and draft persistence
- [x] Add waterfall toggle (Left / Right) in cabinet edit dialog for end-of-run / island cabinets
- [x] Render waterfall slab in elevation view (vertical panel same color as countertop, floor to countertop height)
- [x] Add waterfall sq ft to BOM/quote (cabinet height × cabinet depth per waterfall side)
- [x] Show waterfall panels in fabricator countertop sheet
- [x] Run typecheck and tests (all 1338 tests pass, 0 TS errors)

## Bug: AI Photoreal Preview generates generic kitchen instead of user's design
- [x] Enhanced buildPhotorealScene to send detailed per-cabinet sequences (left-to-right, with widths and types) instead of vague "12ft run of base cabinets"
- [x] Added window/door opening context to wall summaries
- [x] Strengthened prompt with CRITICAL LAYOUT INSTRUCTION and ABSOLUTE CONSTRAINTS to force the AI to reproduce the exact arrangement
- [x] Updated tests to match new prompt wording

## Feature: Polygon-based custom room drawing (bump-outs, chimneys, bay windows)
- [x] Design polygon room data model (vertices array, wall segments with IDs)
- [x] Create geometry helpers: polygon area, wall normals, point-in-polygon, wall lengths
- [x] Build polygon room editor UI under "Draw Room" button
- [x] Implement split tool to add vertices to wall segments
- [x] Implement vertex drag to push walls inward (chimney) or outward (bump-out)
- [x] Integrate polygon walls with cabinet placement (cabinets placeable on any wall segment)
- [x] Update plan view (bird's eye) to render polygon room shape
- [x] Update elevation view to render cabinets on polygon wall segments
- [x] Backward compatibility: existing rectangular rooms still work (rectangle = 4-vertex polygon)
- [x] Persist polygon room data in draft saves
- [x] Tests for polygon geometry helpers (20 tests passing)

## Feature: Replace AI Photoreal Preview with deterministic preview modes
- [x] Remove AI Photoreal Preview button and component from Design Tool
- [x] Add new "Preview" button/menu with three tabs (Elevation, 3D View, Materials)
- [x] Build Enhanced 2D Elevation rendering (canvas-based with shadows, raised panels, hardware, countertop, flooring)
- [x] Build Isometric 3D View (deterministic perspective from actual cabinet data with proper occlusion)
- [x] Build Materials Mood Board (grid of selected finish swatches with labels)
- [x] Run typecheck and tests (0 TS errors, 278 design tests pass)

## Simplify cabinet auto-suggestions (only base→wall pairing)
- [x] Remove OTR bridge suggestion
- [x] Remove corner base 12" wall suggestion
- [x] Remove diagonal base corner suggestion
- [x] Remove WEC (open-end cabinet) suggestion
- [x] Remove wine rack combo suggestion
- [x] Remove diagonal wall corner suggestion
- [x] Keep ONLY: base cabinet placed → offer matching wall cabinet above
- [x] Remove unused imports (bridgeCabinetCodeForWidth, bridgeHeightForWallHeight)
- [x] Remove unused baseCabPool query and baseCabPoolRef
- [x] 0 TS errors, 278 design tests pass

## Fix trim photo mismatches and add missing trim items
- [x] Generate/find correct photos for WSV-24, WSV-30, WSV-36 (currently all show WSV-42 photo)
- [x] Generate/find correct photo for RS-15 (currently shows RS-18 photo)
- [x] Generate/find correct photo for CTRAY-36 (currently shows CTRAY-33 photo)
- [x] Fix BFF-3 photo (currently shows regular filler F-3-96 photo instead of fluted filler)
- [x] Fix BCM-8 photo (filename suggests DCM molding photo)
- [x] Fix RCM-4S photo (filename suggests LACM photo)
- [x] Fix WMS-30-18 photo (filename suggests MO-30-30 photo)
- [x] Upload corrected photos and update database URLs
- [x] Add 22 missing UCD trim items: LACM8, CMB, DCM, KCM, ROPE, SCR, TKC, FOL630, FOL636, FOL642, BBFPV4296, REPV3096, REPVKIT, WDEP1212, WDEP1215, WDEP1218, WDEF42, S3696, MCB, CDL, SCDL, VASH48

## Skyline trim audit fixes
- [x] Add 3 missing Skyline arched valances: AV-30, AV-36, AV-42 (new cabinet records + 16 Skyline distributor SKUs each)
- [x] Fix 2-style coverage gap on Skyline trim items at 30/32 (added CG Prism Clear + MG Nocturne Glass to 10 items, all now 32/32)

## Clark & Son trim fixes
- [x] Add GV (Greek Villa / 120001) SKUs to all 17 shared trim items
- [x] Fix smaller style gaps: BAM missing ASP, PLYEB-42 missing ASP, DD-Q missing CC, WEP-15-42 missing CC, WFF-3-42 missing CC, TUK missing DN
- [x] Fix WS-12-42 (only 3/13 styles, now 13/13)
- [x] Add ROPE CS SKUs (shared master code now has 13/13 CS styles)
- [x] Add/fix images for WEP-15-42 and WFF-3-42
- [x] Resolve 152 Designer Natural (DN) conflicted items: cleared conflictStatus, published all SKUs
- [x] Build AI Catalog Services section in vendor page ($100/hr catalog onboarding service)
- [x] Extend Photo to Cart to support plumbing fixtures (bathtubs, sinks, faucets, showers, toilets) with visual matching
- [x] Add Fixture Photo Match CTA on the Plumber's Choice page
- [x] Build Price Shop page (/price-shop) with 19'L kitchen layout comparison across all styles
- [x] Fix Price Shop: WDC-30 (Diagonal Corner Wall) and Easy Reach 36 (ERB-36/LSB36/LS-36-12) — added multi-code alternatives + admin cost column with margin %
- [x] Add 93 missing Skyline SKUs: B-42 (30 styles), TKC (30 styles), BT-09 (24 styles), B-39 premium (9 styles) — pricing corrected (yourCost = listPrice × 0.35)
- [x] Fix confusing Skyline style names: set ourName = distributorName for all 32 Skyline styles (e.g., "Blanc Core" → "Shaker White")

## Bug: No "Start New" / clear design button on desktop
- [x] Add a "Start New" button to the desktop toolbar so users can clear the entire floor plan without needing the mobile "More" sheet

## Footer cleanup
- [x] Remove CATALOG section (Base, Wall, Tall, ADA, Vanity, Accessory links) from the site footer

## Feature: Full database export with filters in admin
- [x] Build admin backend endpoint for filtered product export (by category, distributor, door style, or all)
- [x] Export includes: cabinets, distributor_skus, door_styles, distributors, pricing — all fields needed to rebuild
- [x] Build admin UI with filter dropdowns (category, distributor, style) and "Download" button

## Admin panel: Reorganize tabs into 6 logical groups
- [x] Replace flat 30+ tab list with grouped navigation (Sales & Orders, People, Products & Catalog, Pricing, Operations, Settings)
- [x] Each group shows its sub-tabs when selected
- [x] Preserve all existing functionality and URL deep-linking (?tab=xxx)

## Admin: Delete button for incoming orders/messages
- [x] Add "Delete All" button to Incoming Orders admin tab (already existed)
- [x] Add individual delete button per order (already existed)
- [x] Backend endpoint to delete orders (single + bulk) (already existed)
- [x] Delete all test orders from the database (359 order_requests cleared)

## Feature: Full Vendor Portal (replace existing Supplier Portal)
- [x] Phase 1: Vendor auth system (email/password login form — uses existing emailAuth router)
- [x] Phase 2: Vendor portal dashboard shell (already existed with sidebar nav, overview stats)
- [x] Phase 3: Order management (already existed in vendor portal)
- [x] Phase 4: Catalog management (already existed — CSV upload, new product form, visibility toggles)
- [x] Phase 5: Inventory integrations (NetSuite, Epicor, QuickBooks, generic REST API) — UI added
- [x] Phase 6: Payment connection (Stripe Connect onboarding UI added)
- [x] Phase 7: AI Catalog Helper ($100/hr) — already existed in vendor portal
- [x] Phase 8: Product promotion — already existed in vendor portal

## AI Services: History log for vendors
- [x] Add history log section to AI Services page showing previously processed catalogs with status, time, and final cost

## Vendor invite links from Approved Vendors admin tab
- [x] Add "Invite" button to each vendor row in Approved Vendors admin tab
- [x] Generate unique invite token and link when clicked
- [x] Copy link to clipboard for admin to share with vendor
- [x] Vendor clicks link → lands on /vendor registration page with pre-filled vendor info
- [x] Registration with invite token assigns role=distributor and links to correct distributor

## Admin bypass for Vendor Portal
- [x] Add "View Portal" link on each vendor in Approved Vendors admin tab → navigates to /vendor?as=<distributorId>
- [x] Vendor Portal detects ?as= param when user is admin → shows that vendor's dashboard
- [x] Admin sees full vendor dashboard without needing email/password login
- [x] Add vendor selector dropdown in portal header so admin can switch between vendors

## Feature: Island edge snapping in Design Tool
- [x] When dragging a cabinet near an island, snap it to the island's edges (left, right, front, back sides)
- [x] Show a snap indicator/highlight when a cabinet is close enough to snap to the island

## Feature: Filler auto-snap into gaps
- [x] When a filler cabinet is placed/dropped, auto-find the nearest wall gap and snap the filler into it, auto-sizing to fill the gap exactly
- [x] Show a toast confirming where the filler was placed and its auto-sized width

## Feature: Pantry 4-door elevation rendering
- [x] All tall pantry cabinets (U-*) render 4 doors in elevation: 2 doors on bottom section (floor to 54") and 2 doors on top section (54" to top), split at the 54" mark

## Island Elevation Preview

- [x] Wire ponyWalls props to both PlanCanvas instances in DesignTool (desktop + mobile/split)
- [x] Create IslandElevationView component — renders island cabinets in front-view elevation using island.width as the span
- [x] Add "Island" view mode button to DesignTool toolbar (only visible when an island zone is active)
- [x] Wire IslandElevationView into the main canvas area for the "island" view mode
- [x] Exclude island view from the wall-layer toggle (plan-only control)

## AI Consultant Chat Button Relocation

- [x] Remove AI Consultant button from the toolbar row
- [x] Add floating action button (FAB) pinned to bottom-right of canvas — dark pill with sparkle icon + "Design Consultant" label
- [x] FAB shows "Close AI" + X icon when panel is open
- [x] On mobile the FAB sits above the bottom nav bar (bottom-20), on desktop it sits at the canvas edge (bottom-4)

## CSV Parts List Import (2020 Design BOM)

- [x] Add trpc.ocr.parseCSV procedure — parses CSV/TSV text, auto-detects code/qty columns, matches codes against live catalog using existing matchCabinetCodes logic
- [x] Create CsvImportDialog component — drag-drop CSV upload, review table with match confidence badges, door style + tier selector, add-to-cart action
- [x] Add "Import from 2020 Design (CSV)" button to PhotoToCart page header
- [x] Add "Import CSV" button to DesignTool desktop toolbar

## Remove Gap-Fill Cabinet Suggestions from Designer

- [x] Remove the suggestion popover (Place / Place with Filler buttons) from gap label chips in PlanCanvas
- [x] Keep gap measurement label chips as display-only (pointer-events-none) so designers can still see gap sizes
- [x] Remove activeGap click handler — chips no longer open any popover

## Remove Wall-Cabinet-Above Suggestion Toasts

- [x] Remove the entire "Place a matching wall cabinet above?" toast block from addCabinet
- [x] Remove the one-time wall cabinet height prompt toasts (42"/36"/30") that fired on first base cabinet placement

## Island-Wall Cabinet Snapping

- [x] Extend orientToWall in design.ts to accept island prop and auto-rotate cabinets to face the nearest island edge when dragged within SNAP_THRESHOLD
- [x] Pass island to orientToWall in PlanCanvas handlePointerMove so cabinets auto-orient when snapping to island walls
- [x] Existing snapPosition island edge snapping (flush-to-edge) already worked; now combined with auto-rotation

## Affiliate Administration Panel

- [x] Add "Credentials & Links" tab to AffiliateDashboard as first/default tab
- [x] Show storefront URL, referral code, login link, and template preview button in credentials tab
- [x] Enhance AffiliatesAdmin with per-affiliate "View Storefront" preview button
- [x] Add "Send Credentials" email button in AffiliatesAdmin
- [x] Add template switcher in AffiliatesAdmin per-affiliate card
- [x] Add "Demo Storefront" sales tool button in admin panel linking to /store-preview/classic
- [x] Add template switcher to demo storefront preview banner

## Affiliate Dashboard Redesign (White-Label & Performance Focus)

- [x] Strip wholesale pricing, vendor agreements, Stripe, and shipping calculator from AffiliateDashboard
- [x] Remove all Cabinet Dealz brand mentions from affiliate storefronts (white-label enforcement)
- [x] Add Customize tab: room scene picker, door style selector, template/layout switcher
- [x] Add AI Concierge upsell card ($100/hr service request form)
- [x] Ensure affiliate dashboard tabs: Performance, Commissions, Payouts, Credentials, Customize, AI Concierge

## Affiliate Dashboard Redesign — Phase 2 (Active)

- [x] Remove My Catalog & Pricing tab from AffiliateDashboard (CatalogBrandingEditor, StyleBrandingTable, StyleBrandingRow)
- [x] Remove CATEGORY_KEYS, bpsToPct, pctToBps helper functions (only used by CatalogBrandingEditor)
- [x] Fix "Copy All Credentials" text: replace "Your Cabinet Dealz affiliate credentials:" with generic text
- [x] Fix Storefront.tsx line 71: change "Go to Cabinet Dealz" button text to "Go Home"
- [x] Fix Storefront.tsx line 191: remove "through Cabinet Dealz" from Surfaces section copy
- [x] Fix storefrontI18n.ts: change footer_powered from "Powered by Cabinet Dealz" to generic "Powered by our platform" (all 3 languages)
- [x] Rename "Storefront Branding" tab to "Customize"
- [x] Add Room Scene Picker section in BrandingEditor/Customize tab (5 KITCHEN_SCENES as clickable cards)
- [x] Add Door Style Showcase selector in Customize tab (pick which door styles to feature)
- [x] Add AI Concierge upsell card in Customize tab ($100/hr service request form)
- [x] Add requestAiConcierge tRPC procedure to affiliates router (notifyOwner)

## Design Tool UX Fixes (Jul 8)

- [x] Move AI chat button to right of logo in TopNav (inline, not floating)
- [x] Enable pony wall deletion via the mobile Delete toolbar button and Delete/Backspace key (add selectedPonyWallUid state, extend deleteSelected and keydown handler, pass selection props to PlanCanvas)

## Bug: Pelican products not loading on vendor page (Jul 8)

- [x] Detect PEL distributor in VendorPortal and render Pelican catalog (trpc.pelican.adminList) instead of distributorPortal.catalog
- [x] Show Pelican product cards with visibility toggle, popular toggle, coverage field in the My Catalog tab for PEL
- [x] Show correct product count for PEL in Overview stats

## Bug: Vendor account images not loading (Jul 8)

- [x] Diagnose why vendor/distributor images are not loading across all vendor portal pages
- [x] Fix image URL resolution (storage proxy, broken paths, or missing imageUrl fields) — storage proxy returns 200 for all image types; 92 SKU images and all door style images load correctly
- [x] Verify images load for cabinet SKUs, door styles, and Pelican products — confirmed working via curl tests

## Pelican Vendor Portal Fixes (Jul 8)

- [x] Pre-fill coverageSqFt from packaging data (size field) for Pelican products — no manual entry needed
- [x] Remove image column from PelicanVendorCatalogPage (Pelican has no product images — sq ft/box shown as read-only)
- [x] Fix broken category hyperlink buttons on PelicanVendorOverviewPage — clicking a category should filter the catalog tab

## Bug: Shopping cart not shown on affiliate storefront pages (Jul 8)

- [x] Add cart icon with item count badge to NavLinks in Storefront.tsx (all 4 header templates: Classic, Showcase, Minimal, Craftsman)
- [x] Cart link should use withRef("/cart") to preserve affiliate referral attribution
- [x] Cart icon should use useCart() to show live count badge
- [x] Ensure CartContext is available in the Storefront page (main.tsx wraps CartProvider at root level)

## Bug: Design Tool desktop toolbar row clips off screen (Jul 8)

- [x] Make the second toolbar row (Island, Crown, Toe Kick, Batten, Light Rail, Valance, Filler, Countertop, Rotate, Swing, Delete, Lock Cabs, Save, My Designs) scroll horizontally or collapse into an overflow menu so nothing is cut off at narrower desktop widths
- [x] Ensure all toolbar buttons remain accessible at 1280px viewport width and above

## Bug: Design Tool toolbar two rows overlapping (Jul 8)

- [x] Revert flex-nowrap + overflow-x-auto on toolbar row (it caused two rows to stack/overlap)
- [x] Move secondary toolbar buttons (Island, Crown, Toe Kick, Batten, Light Rail, Valance, Filler, Countertop, Rotate, Swing, Delete, Lock Cabs, Save, My Designs) into a "More ▾" dropdown menu so the toolbar stays on one clean row
- [x] Keep primary actions (Draw Room, Custom Shape, Wall height, Wall selector, Lock Layout, Auto-Fill, View toggle, Print Sheet, Measure, Add Note, Dimensions, Undo/Redo) visible in the main row

## Feature: Pelican product images in vendor catalog table (Jul 8)

- [x] Check what image URL field Pelican products use (imageUrl, thumbnailUrl, or similar)
- [x] Include image URL in pelican.adminList procedure response
- [x] Add a thumbnail image column to PelicanVendorCatalogPage table (40x40 or 48x48 square, same image as public Surfaces & Fixtures pages)
- [x] If no image exists for a product, show a neutral placeholder icon
- [x] Ensure the image shown in vendor catalog matches what's shown on the public storefront (same URL field, same source)

## Affiliate Administration Panel Enhancements (Jul 8)

- [x] Add "View Storefront" preview button per affiliate in AffiliatesAdmin tab (links to /store/{referralCode})
- [x] Add "Send Credentials" email button in AffiliatesAdmin per-affiliate card (triggers email with storefront URL + referral code)
- [x] Add template switcher in AffiliatesAdmin per-affiliate card (dropdown to change their template)
- [x] Add "Demo Storefront" sales tool button in admin panel linking to /store-preview/classic

## Bug: Affiliate Storefront — No Add-to-Cart on Product Cards (Jul 8)

- [x] Add quantity input and "Add to Cart" button to product cards on affiliate storefront catalog (/store/{slug})
- [x] Ensure clicking a product card or "Add to Cart" adds the item to the order/cart
- [x] Verify the cart/order flow works end-to-end from the affiliate storefront

## Bug: Door Detail Button on Affiliate Storefront Shows Wrong Content (Jul 8)

- [x] Fix "door detail" chip/button on the family picker cards — clicking it should open a modal showing the door sample image + construction facts (door style, wood species, box construction, drawer construction, hardware, frame size, overlay type, door panel type)
- [x] The modal should pull data from the locked family's door style record (doorSampleImageUrl, doorStyle, woodSpecies, boxConstruction, drawerConstruction, hardware, frameSize, overlayType, doorPanelType)
- [x] Ensure the modal is accessible and dismissible

## Bug: Mobile Design Tool Layout Issues (Jul 8)
- [x] Fix "Designer" title overlapping the room size/toolbar buttons on mobile
- [x] Hide Draw Room and Custom Shape buttons on mobile (should only appear in the More sheet)
- [x] Fix large empty gap between toolbar and canvas on mobile — gap is expected (canvas fills height, room auto-fits to width)
- [x] Ensure canvas auto-fits to mobile viewport height (no wasted space) — ResizeObserver auto-fits room to container
- [x] Ensure the mobile toolbar (Catalog/Front/Rotate/Delete/Lock/Cart) is always visible at bottom — confirmed fixed bottom-0 position

## Feature: Affiliate Custom Hero Image Upload
- [x] Add heroImageUrl field to affiliates table in drizzle schema
- [x] Run migration and apply SQL
- [x] Update storefront hero section to use affiliate's heroImageUrl when present (falls back to default kitchen photo)
- [x] Add image upload UI in affiliate dashboard (AffiliateDashboard.tsx) — "Upload Kitchen Scene" button with preview
- [x] Add updateHeroImage procedure to affiliates router (upload to S3, save URL)
- [x] Image should only appear on the affiliate's own storefront, not on main CabinetDealz site

## Affiliate Link Fix & Welcome Guide (Jul 8)

- [x] Fix broken /admin/affiliates link on storefront footer (changed to /admin#affiliates)
- [x] Create affiliate welcome guide PDF (storefront, dashboard, marketing, CRM usage)
- [x] Upload welcome guide PDF to static assets (manus-storage)
- [x] Add welcome guide PDF link to Send Credentials dialog in admin panel
- [x] Add "Download Welcome Guide" button to affiliate dashboard Credentials tab

## Feature: Nationwide Sales Tax Calculator

- [x] Add US state sales tax rates table (shared/usSalesTax.ts, all 50 states + DC)
- [x] Add getTaxRate tRPC procedure (public, takes state code, returns rate + label)
- [x] Add listStates tRPC procedure (returns all states for selector dropdown)
- [x] Wire tax calculation into order/quote form — state selector, tax rate, tax amount, grand total
- [x] Show tax line in admin order detail view (subtotal + tax + grand total)
- [x] Store taxState, taxRate, taxAmount on the order record in the database

## Feature: W-9 / Tax Compliance for Affiliates

- [x] Add W-9 fields to affiliates table: legalName, entityType, taxId (SSN/EIN), address, city, state, zip, idDocumentUrl, w9Status (pending/submitted/verified)
- [x] Run migration and apply SQL
- [x] Add saveW9Info tRPC procedure (partnerProcedure) to save legal info
- [x] Add uploadIdDocument tRPC procedure (partnerProcedure) to upload ID to S3
- [x] Add adminVerifyW9 tRPC procedure (adminProcedure) to mark W-9 as verified
- [x] Build W-9 tab in affiliate dashboard with form (legal name, entity type, SSN/EIN, address) and ID upload
- [x] Show W-9 status badge in admin Affiliates panel per affiliate
- [x] Gate payout display with W-9 required notice if not yet submitted
- [x] Notify owner when affiliate submits W-9 for review

## Feature: Affiliate Admin Panel Rebuild

- [x] Rebuild /affiliate as a proper sidebar admin panel (DashboardLayout) with nav sections: Dashboard, CRM, Orders, Earnings, My Catalog, Pricing & Margins, My Store, Tax Info, Credentials
- [x] Affiliate cost constants in shared config: AFFILIATE_BASELINE_PCT=0.05, DAMAGE_FEE_PCT=0.01, CC_FEE_PCT=0.04, IT_FEE_PCT=0.10, IT_FEE_MAX=100
- [x] Build Pricing & Margins tab: default markup %, per-door-style markup overrides, live cost calculator showing floor cost breakdown and net profit at different markups
- [x] Build My Catalog tab: pick which door styles to feature on storefront, reorder them, rename them (white-label), upload per-style room scene photo
- [x] Add affiliateStyleBranding table fields: customName (white-label name), roomSceneUrl, markupBps, featured (boolean), sortOrder
- [x] Apply markup to storefront prices: storefront catalog uses affiliate's per-style or default markup to compute customer-facing price
- [ ] Affiliate-branded invoices: customer invoice shows affiliate logo, store name, white-labeled cabinet names (not Cabinet Dealz or distributor names)
- [ ] White-label names appear on order confirmation emails sent to customers
- [x] Affiliate Analytics tab: storefront page views, unique visitors, orders, conversion rate, commission over time (weekly/monthly chart), top door styles viewed
- [x] Marketing Hub: QR code generator, business card PDF, phone strip PDF, digital business card link, sales guides, YouTube resources

## Feature: Stripe Approval Readiness

- [x] Fix contact info on main site — Cabinet Dealz: (941) 899-3288, sales@cabinetdealz.com, 470 N Tamiami Trail, Osprey FL 34229
- [x] Create /contact page
- [x] Create /shipping-policy page
- [x] Create /return-policy page (references vendor policies)
- [x] Create /privacy-policy page
- [x] Create /terms page
- [x] Add footer links to all four policy pages + contact
- [ ] Add Stripe payment integration

## Feature: QuickBooks Integration

- [x] Add tRPC procedure `admin.exportOrdersQBO` — returns orders in QuickBooks-compatible CSV format
- [x] Build QuickBooks CSV export button in admin Incoming Orders panel (date range picker + download)
- [x] CSV format: QuickBooks-compatible columns (TxnType, Date, Name, ItemDescription, Qty, Price, Tax, Total)
- [x] Set up QuickBooks Online OAuth2 flow (server-side: /api/qbo/connect, /api/qbo/callback, token storage)
- [x] Store QBO tokens in DB (qbo_tokens table: accessToken, refreshToken, realmId, expiresAt)
- [x] Add tRPC procedures qbo.syncOrder and qbo.syncAll — push orders as QBO Invoices
- [x] Add "Sync to QuickBooks" button per order in admin Incoming Orders detail dialog
- [x] Add bulk "Sync All Unsynced" button in Admin → Settings → QuickBooks tab
- [x] Track qboSyncedAt and qboInvoiceId on order_requests table
- [x] Show QBO invoice ID + sync date in admin order detail dialog

## Feature: Oxford Cashmere & Shaker Unfinished SKU Import

- [x] Scrape full OC-* and SU-* SKU pricing from USCD V6 P&A PDF (OC shares OW price tier, SU shares SW price tier)
- [x] Import all Oxford Cashmere SKUs (232 rows) with correct list prices into distributor_skus table
- [x] Import all Shaker Unfinished SKUs (264 rows) with correct list prices into distributor_skus table
- [x] Upload thumbnail images for OC and SU from USCD website to Manus storage
- [x] Both styles now visible on Door Styles page under Raised Panel and Shaker filter tabs

## Update: Shipping Policy Page

- [x] Retrieved exact USCD shipping policy terms from uscabinetdepot.com/terms-and-conditions
- [x] Updated ShippingPolicy.tsx with verbatim USCD shipping terms (LTL freight, lead times, damage claims, warehouse pickup)

## Feature: USCD Full Catalog Audit (V6 P&A)

- [x] Parsed V6 P&A PDF into structured SKU/price table (248 unique master SKUs, all 20 style columns)
- [x] Compared parsed V6 data against database — found 235 wrong-price rows, 4884 missing rows, 4362 extra rows
- [x] Identified extra rows as hyphenated-format SKUs (B-12 vs B12) — same cabinets, different naming convention
- [x] Normalized 144 hyphenated masterCodes in cabinets table to match V6 format (B-12 → B12)
- [x] Applied 2048 price corrections across all USCD styles to match V6 list prices exactly
- [x] Removed 1275 inactive/discontinued USCD SKU rows (63 unmatched master codes, 11 cabinet records deleted)
## Feature: Affiliate Admin Shortcut from Storefront
- [x] Add "Manage Affiliates (Admin)" button in affiliate storefront footer (admin-only)
- [x] Button links to /admin?tab=affiliates&affiliateId=[id] with the specific affiliate's ID
- [x] AdminGroupedTabs reads ?tab= query param on mount to auto-select the correct group/tab (already wired)
- [x] AffiliatesAdmin reads ?affiliateId= query param to auto-expand and scroll to the matching affiliate card
- [x] Add id="affiliate-row-{a.id}" to each affiliate Card element for scroll targeting

## Conflict Status: Ambiguous Cabinet Records

- [x] Identify cabinets with no approved distributor SKUs and no placementType (166 records)
- [x] Identify Accessory items with no subCategory and no approved SKUs (2 records)
- [x] Mark all 175 ambiguous cabinets as conflictStatus='conflict' with descriptive reasons
- [x] Admin review queue: resolve conflict status for each group (assign to correct distributor, add placementType, or deactivate)

## Feature: Cabinet Catalog Images (SQL Bulk Update)
- [x] Assigned catalogImageUrl to all 573 cabinets using AI-generated config images
- [x] Mapped images by category/subCategory/description patterns (Base, Wall, Tall, Vanity, Accessory)
- [x] All 224 base cabinets returned by placeableCabinets API now have catalog images
- [x] Designer palette shows correct images for all cabinet types

## Feature: Room Scene Photos & Pantry Image Corrections (July 17, 2026)
- [x] Extract room scene photos from Clark and Sons 2025 catalog (page 47) — 6 kitchen scenes
- [x] Extract room scene photos from Skyline Builder Grade catalog — GR Shaker Gray
- [x] Extract room scene photos from Milestone Slim Shaker 2026 catalog — SAO Slim Amber Oak
- [x] Download room scene photos from Milestone gallery — SIB, SWO, SDW, SAG
- [x] Generate AI room scene for Fresh Sage (FS) — sage green kitchen
- [x] Generate AI room scene for Platinum Shaker (PS) — platinum gray kitchen
- [x] Upload all Clark and Sons, Skyline, and Milestone room scene images to CDN
- [x] Update roomSceneImageUrl for all 66 door styles in database (0 missing)
- [x] Generate double-door tall pantry cabinet image for 24" and 30" utility pantry cabinets
- [x] Fix U24xxxx and U30xxxx utility pantry cabinets to use double-door pantry image
- [x] Verify U18xxxx uses single-door pantry image (correct)
- [x] Verify UOC/O3xxxx oven pantry cabinets use oven cabinet image (correct)

## Bug: Clark and Sons fridge cabinet SKU mapping broken + fridge popup missing options
- [x] Audit Clark and Sons WR-prefix fridge cabinet SKUs in the database (WR3324 = 33w x 24h x 24d bridge)
- [x] Fix fridge cabinet SKU resolver: map WR prefix for Clark and Sons (WR{width}{height} = 24-deep bridge)
- [x] Restore all fridge options in the fridge popup (options missing since yesterday)
- [x] Verify W361224 equivalent is correctly resolved for Clark and Sons as WR3624
- [x] Test and checkpoint

## Bug: Clark and Sons fridge cabinet SKU mapping and popup options

- [x] Fix WR-prefix cabinets (Clark and Sons 24"-deep fridge wall) depth stored as 12 → corrected to 24 in DB
- [x] Fix bridge cabinet heights stored as 30 → corrected to actual heights (12/15/18) from masterCode
- [x] Update surroundForFridge query to include WR% pattern for Clark and Sons deep fridge wall cabinets
- [x] Update surroundForFridge query to include REP9% pattern for Clark and Sons refrigerator end panels
- [x] Remove WS1% (wall skin) from smoothPanels — WS1542 is not a refrigerator smooth panel
- [x] Update builtinFridgeRun to include WR% and REP9% patterns for Clark and Sons
- [x] Verify fridge options popup shows all options: deepAbove=10, bridgeAbove=9, endPanels=1, smoothPanels=0 for Clark and Sons styles

## Bug: Clark & Sons fridge cabinet SKU resolver broken + fridge popup missing options (Jul 17)
- [ ] Fix Clark & Sons WR-prefix SKU resolver: W361224 must map to WR3612 (WR{width}{height}, always 24 deep)
- [ ] Restore all fridge popup options that were showing before (heights, depths, widths)
- [ ] Verify Clark & Sons fridge bridge cabinets resolve correctly for all widths (30, 33, 36, etc.)

## Bug: Over-fridge cabinet shows drawer band instead of two doors
- [x] Fix ElevationView.tsx: wall-placement cabinets must never show a drawer band (drawers prop must be 0 for wall cabinets)
- [x] Verify fix in browser: over-fridge cabinet shows only 2 doors, no drawer band
- [x] Restore color picker to mobile toolbar in DesignTool.tsx

## Bug: US Cabinet Depot door style shows "No cabinets available for this door style"
- [ ] Investigate why selecting a US Cabinet Depot door style shows no cabinets in the design tool catalog
- [ ] Fix the catalog query/filtering so USCD cabinets appear when a USCD door style is selected

## Feature: Generic Cabinets Admin Screen
- [x] Admin page /admin/generic-cabinets — table of all master cabinet codes
- [x] Columns: masterCode, description, category, subCategory, width, height, depth, weight, catalogImageUrl
- [x] Inline editing for all fields (description, category, subCategory, dimensions, weight)
- [x] Category/subCategory filter dropdowns
- [x] Search by code or description
- [x] Photo upload/change per cabinet (catalogImageUrl)
- [ ] Sync from Generic tab (import from Google Sheet)
- [x] Save changes to cabinets table in DB
- [x] Added alias columns to cabinets table: sku, vendorSku, altSku1, altSku2, altSku3
- [x] Added stainColor and constructionMethod columns to cabinets table
- [x] Added catalogImageUrl column to cabinets table
- [x] Backend router: genericCabinets (list, update, uploadCatalogImage, distributorCoverage, distributorZips, updateDistributorZips, bulkUpdateAliases, categories)
- [x] Frontend: GenericCabinetsAdmin card grid with inline editing, alias display, distributor coverage dialog, zip manager
- [x] Wired into AdminGroupedTabs under Products & Catalog → Generic Catalog tab
- [x] Image upload uses tRPC uploadCatalogImage mutation (base64 → S3)
- [x] TypeScript clean; checkpoint saved

## Enhancement: Generic Cabinets Admin inline editing UX
- [x] Table view with sortable columns: thumbnail, code, description, category, dims, aliases, status icons
- [x] Grid view toggle (table ↔ card grid)
- [x] Slide-out detail panel: opens on row click, shows all editable fields side-by-side
- [x] Toggle switches for isActive / showInDesigner / showInCatalog (auto-save on toggle)
- [x] Unsaved-changes indicator + Revert button + sticky Save footer in panel
- [x] Bulk-select rows with checkbox column + select-all header checkbox
- [x] Bulk action bar: Activate, Deactivate, Show in Designer, Hide from Designer
- [x] Catalog image upload in panel (hover overlay, click to upload)
- [x] Distributor coverage button in panel opens coverage dialog
- [x] TypeScript clean; checkpoint saved

## Cabinet detail admin editing follow-up
- [x] Fix `cabinetOverrides.ts` TypeScript errors and register the router
- [x] Verify package dimension fields are already present in GenericCabinetsAdmin
- [x] Extend `CabinetDetail.tsx` admin edit dialog to expose `physicalWidth`, `pkgLength`, `pkgWidth`, `pkgHeight`, and `pkgWeight`
- [x] Add distributor-specific cabinet override controls to `CabinetDetail.tsx` using the `cabinetOverrides` admin router
- [x] Preserve master-SKU grouping behavior while allowing distributor-specific dimension overrides
- [x] Run TypeScript checks and targeted tests for the CabinetDetail admin editing flow

## Distributor pricing import upgrade
- [x] Upgrade shared distributorImport.ts to support alias-based cabinet lookup (sku/vendorSku/altSku1-3/masterCode)
- [x] Add Door Style column support to importPreview and importCommit (per-row style resolution)
- [x] Rewrite distributors.ts importPreview/importCommit with alias map + style map
- [x] Update DistributorImport UI: improved column guidance, alias match indicators, optional style override dropdown
- [x] TypeScript clean (0 errors)

## XLSX import engine enhancements (second spreadsheet format support)
- [x] Fix SmartCatalogUpload.tsx TypeScript errors — adapt to new importWithMapping API shape
- [x] Add Assemble column detection in parseXlsxColumns (role: "assemble")
- [x] Add assemble role to importWithMapping input schema
- [x] Add SKU-prefix category inference (ADA-, VDB, W*, B*, T* prefixes → platform categories)
- [x] Add dimension extraction from description field (parseDimsFromDesc) as fallback when no dim column
- [x] Pass isAssembled flag to cabinet insert/update when Assemble column is present
- [x] TypeScript: 0 errors after all enhancements

## XLSX import preview validation highlighting
- [ ] Extend importWithMapping dry-run to return per-row issues: unrecognized SKU, missing prices, invalid dimensions
- [ ] Add validation severity field (error/warning) to each preview row
- [ ] Update DistributorImport preview table to highlight rows red (error) or orange (warning)
- [ ] Show a summary banner: "X errors, Y warnings — fix before committing"
- [ ] Disable Commit button when any error-severity rows exist
- [ ] TypeScript clean and checkpoint

## PDF-to-Excel converter (admin)
- [x] Install pdfplumber Python package on server (via child_process spawn)
- [x] Build server-side pdfToXlsx tRPC procedure: accept base64 PDF, extract tables, return base64 XLSX
- [x] Handle multi-style column headers (e.g. "SW/SA/SD/SG" → split into separate columns in output)
- [x] Strip footnote markers (†, *, **) from price cells before output
- [x] Skip section-header rows (rows where SKU column looks like a category label, not a SKU code)
- [x] Build PDF converter UI tab in admin import panel (upload PDF → preview extracted table → download XLSX)
- [x] Add "Open in Import" shortcut to feed the converted XLSX directly into the XLSX import flow

## Import preview per-row match dropdown

- [x] Add `searchForMatch` admin procedure to `genericCabinets` router (search by masterCode/sku/vendorSku/altSku1-3/description)
- [x] Add `matchOverrides` state to `DistributorImport` (rowNum → cabinetId)
- [x] Add `MatchDropdown` component: popover with search input, shows top results, click to select, X to clear
- [x] Wire `MatchDropdown` into every XLSX preview table row (replaces static Badge)
- [x] Color-coded match badge: green=exact, blue=alias, violet=override, red=no match
- [x] Pass `matchOverrides` in both dry-run and commit payloads
- [x] Server-side `importWithMapping` respects `matchOverrides` (uses specified cabinetId instead of alias lookup)
- [x] Add `weight` and `assemble` to `ROLE_LABELS` and column detection
- [x] Add validation highlighting to preview table (red/orange rows, summary banner, disable Commit on errors)

## Import preview inline cell editing

- [x] Add `cellEdits` state to `DistributorImport` (rowNum+field → edited value)
- [x] Render red-highlighted price cells as clickable inputs (click to edit, Enter/blur to confirm)
- [x] Render red-highlighted dimension cells as clickable inputs
- [x] Pass `cellEdits` in the dry-run payload so the server re-validates with the corrected values
- [x] Server-side `importWithMapping` applies `cellEdits` overrides before validation/preview
- [x] After editing a cell, auto-trigger a re-validate (new dry-run) so the row severity updates
- [x] TypeScript check passes; checkpoint saved

## Bug: Mobile toolbar missing Color Palette, Room Size, Save buttons

- [x] Restore Color Palette button to mobile toolbar in DesignTool
- [x] Restore Room Size button to mobile toolbar in DesignTool
- [x] Restore Save button to mobile toolbar in DesignTool
- [x] TypeScript check passes; checkpoint saved

## numberOfShelves on cabinet generic record

- [x] Add `numberOfFixedShelves` and `numberOfAdjShelves` int columns to `cabinets` table in schema.ts
- [x] Generate and apply migration SQL
- [x] Expose both shelf fields + numberOfDoors + numberOfDrawers in `adminUpdateCabinet` input and patch
- [x] Show Fixed Shelves, Adjustable Shelves, Doors, Drawers in the public Specifications card on CabinetDetail
- [x] Add `numberOfFixedShelves` dropdown (0–6) to the admin edit form on CabinetDetail
- [x] Add `numberOfAdjShelves` dropdown (0–6) to the admin edit form on CabinetDetail
- [x] Add `numberOfDoors` dropdown (0–2) to the admin edit form on CabinetDetail
- [x] Add `numberOfDrawers` dropdown (0–8) to the admin edit form on CabinetDetail
- [x] Hide Doors and Drawers spec rows for accessory-strip (trim/moulding) items
- [x] TypeScript check passes; checkpoint saved

## Shipping packaging fallback

- [x] Identify where pkg fields are shown to users (CabinetDetail public specs, BulkDimensions admin, order/cart)
- [x] In `cabinets.byCode` (or a shared helper), apply fallback: if distributor override has pkg fields use those, else fall back to master cabinet pkg fields
- [x] Display resolved pkg fields (L×W×H, weight) in the public Specifications card on CabinetDetail
- [x] TypeScript check passes; checkpoint saved

## Generic Cabinet Configuration Area

- [x] Add Depth dropdown (9, 12, 15, 18, 21, 24, 27, 30, 33, 36") to admin edit dialog on CabinetDetail
- [x] Ensure Fixed Shelves (0-6), Adjustable Shelves (0-6), Doors (0-2), Drawers (0-8) dropdowns are in a clearly labeled "Interior Configuration" section
- [x] Build a standalone admin page /admin/cabinet-config for bulk-editing depth/doors/drawers/shelves across all generic cabinets
- [x] Add route and nav link to the admin cabinet-config page
- [x] TypeScript check passes; checkpoint saved

## Cabinet Config Image Upload

- [x] Add catalog image thumbnail + upload button to each row in CabinetConfigAdmin
- [x] Clicking the thumbnail or upload button opens a file picker; selected image uploads via adminUploadCatalogImage then saves via adminUpdateCabinet
- [x] Show upload progress spinner on the row while uploading
- [x] TypeScript check passes; checkpoint saved

## AI Cabinet Image Generation Button

- [x] Add `adminGenerateCatalogImage` server procedure: build prompt from cabinet config, call image gen API, upload result, save URL
- [x] Add "Generate with AI" (sparkle) button to ImageCell in CabinetConfigAdmin
- [x] Show spinner on the row while generating; disable button during generation
- [x] On success, update the row thumbnail immediately; show success toast
- [x] TypeScript check passes; checkpoint saved

## AI Image View Toggle

- [x] Add a per-row `viewMode` state (\"3d\" | \"2d\") in ImageCell, defaulting to \"3d\"
- [x] Render a small toggle/button group next to the sparkle button to switch between Isometric 3D and Flat 2D
- [x] Pass `viewMode` to `adminGenerateCatalogImage` input; server adjusts prompt based on view mode
- [x] TypeScript check passes; checkpoint saved

## Merge Generic Catalog + Cabinet Config & isNotCabinet toggle

- [x] Add `isNotCabinet` boolean column (default false) to `cabinets` table in schema.ts
- [x] Apply migration SQL via webdev_execute_sql
- [x] Expose `isNotCabinet` in `adminUpdateCabinet` input and patch
- [x] Add `isNotCabinet` to `adminListCabinetConfig` return shape
- [x] Remove the separate "Generic Catalog" tab from AdminGroupedTabs; merge its content into "Cabinet Config" tab
- [x] Add "Not a cabinet" checkbox/toggle per row in CabinetConfigAdmin; when checked, hide Depth/Doors/Drawers/Fixed Shelves/Adj Shelves dropdowns and dim the row
- [x] Save `isNotCabinet` immediately on toggle (no separate Save button needed)
- [x] TypeScript check passes; checkpoint saved

## Three image upload slots with auto-resize

- [ ] Audit existing image upload endpoints (adminUploadCatalogImage, uploadCatalogImage, door sample upload) to understand current flow
- [ ] Install `sharp` for server-side image resizing
- [ ] Add `imageSlot` param to upload endpoint: "thumbnail" (300×300 square crop), "door-sample" (400×300), "room-scene" (1200×800)
- [ ] Server resizes and re-encodes image to target dimensions before uploading to S3
- [ ] Wire three distinct upload buttons in CabinetConfigAdmin: Thumbnail, Door Sample, Room Scene
- [ ] Wire three distinct upload buttons in GenericCabinetsAdmin detail panel
- [ ] Wire three distinct upload buttons in CabinetDetail admin edit dialog
- [ ] TypeScript check passes; checkpoint saved

## Fix: Vendor page inconsistent links

- [ ] Find the vendor/distributor listing page component
- [ ] Ensure every distributor card shows a consistent arrow link (→) to its respective page
- [ ] Remove any raw HTML addresses or inconsistent link rendering
- [ ] TypeScript check passes; checkpoint saved

## Fix: Door sample image upload (Winchester Gray) + vendor link consistency
- [x] Add key={editingStyle.id} to EditDialog in FeaturedStylesAdmin so state resets when switching styles
- [x] Add slot prop to ImageField component and pass correct slot per upload type (door-sample, room-scene, thumbnail)
- [x] Fix VendorApplications and ProApplications website links to be consistent (ExternalLink icon + "Website" text)

- [x] Mobile toolbar: move Room Dimensions, Style, and Save buttons to top toolbar as compact icon-only buttons with hover tooltips; remove them from the bottom toolbar
- [x] Fix over-the-fridge cabinet default height from 70" to 72" (RefrigeratorOptionsDialog default, APPLIANCES fridge elevHeight, applyFridgeSurround fallback)
- [x] Add "Our Series Name" field to door_styles schema (ourSeriesName varchar 128), apply ALTER TABLE migration, wire into adminUpdateDoorStyle procedure, add input field to EditDialog in FeaturedStylesAdmin
- [x] Fix fridge elevHeight from 72 to 70 (standard fridge is 70" tall)
- [x] Fix over-fridge cabinet mountBottom to fridgeH+2 (cabinet bottom at 72" for 70" fridge)
- [x] Fix panel height calculation to include 2" gap (fridgeH + 2 + bridgeH)
- [x] Fix RefrigeratorOptionsDialog default fridge height from 72 to 70
- [x] Fix panel rendering in ElevationView: panels render as flat wood skins (no door fronts, no hardware)
- [x] Tighten mobile top toolbar button spacing (gap-1.5 → gap-1)
- [x] Reduce main header padding on mobile (px-3 → px-2, gap-1.5 → gap-1 on mobile)
- [x] Add panel thickness selector (0.75" to 1.2") to fridge surround dialog and wire through to placement logic

## Feature: Guided Onboarding Wizard (/start)
- [ ] Create /start route and GuidedWizard page component (3 steps: Room Type → Door Style → Color)
- [ ] Step 1: Room type selector (Kitchen, Bathroom, Laundry, Closet, Other) with icons
- [ ] Step 2: Door style picker using featured/active styles with thumbnails
- [ ] Step 3: Color/finish picker from selected door style's available finishes
- [ ] "Start Designing" CTA navigates to /design?style=<id>&room=<type> and writes cd_wizard_handoff to sessionStorage
- [ ] DesignTool consumes cd_wizard_handoff on load (applies roomType + styleId)
- [ ] Add "Start Designing" CTA on Home page linking to /start
- [ ] Add /start route to App.tsx

## Feature: Inspiration Gallery (/inspiration)
- [ ] Add inspiration_gallery table to schema (id, title, imageUrl, roomType, doorStyleName, colorName, tags, sortOrder, isActive)
- [ ] Apply CREATE TABLE SQL via webdev_execute_sql
- [ ] Add inspirationRouter with list (public) and admin CRUD procedures
- [ ] Register inspirationRouter in routers.ts
- [ ] Create InspirationGallery page (/inspiration) with masonry/grid layout, filter by room type
- [ ] Add admin UI for uploading/managing inspiration photos (in Admin page)
- [ ] Add /inspiration route to App.tsx
- [ ] Add "Inspiration" link to top nav

## Feature: Layout Starter Templates
- [ ] Create layoutTemplates.ts lib with 6 templates: Single Wall, Galley, L-Shape, U-Shape, Island, Peninsula
- [ ] Each template defines: room dimensions, wall openings, and a pre-placed set of cabinets
- [ ] Create LayoutTemplateDialog component shown when user clicks "Start from Template" in design tool
- [ ] Wire "Start from Template" button into the design tool (More menu or empty-state prompt)
- [ ] Apply template via loadSavedDesign (room + placed + openings)
- [x] Guided Onboarding Wizard (/start) — 3-step wizard: room type → door style → color → launch design tool
- [x] Inspiration Gallery (/inspiration) — filterable public gallery with admin management panel
- [x] Layout Starter Templates — 5 templates (L-shape, U-shape, galley, single wall, island) accessible from design tool Templates button
- [x] inspiration_photos DB table created and inspiration tRPC router registered
- [x] InspirationGalleryAdmin component added to Admin → Products & Catalog → Inspiration Gallery tab
- [x] Homepage hero and featured styles CTAs updated to point to /start wizard
- [x] Fix over-fridge cabinet rendering bug: resolveDoorDrawerCounts regex matched SKU codes (e.g. "W3612 Door" in description → doors=3612). Fixed by changing /(\d+)\s*[- ]?door/ to /\b([1-6])\s*[- ]?door/ (word boundary + 1-6 limit) in cabinetGraphics.ts. Same fix applied to drawer regex.
- [x] Add regression test for W361224 SKU-in-description bug in cabinetGraphics.test.ts
- [x] Add Templates button to mobile bottom toolbar (grid-cols-7 → grid-cols-8, LayoutGrid icon)
