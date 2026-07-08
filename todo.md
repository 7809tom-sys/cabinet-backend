
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
- [ ] Featured products on homepage should pull from actual door styles/surfaces in the design tool database
- [ ] Add "Design with this" CTA button that opens designer pre-loaded with the featured style
- [ ] Admin can mark which styles/surfaces to feature (configurable, top 2-3 items)
- [ ] Ensure featured items show high-quality product images
- [ ] Improve admin image upload flow for updating product photos in one place

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
- [ ] Display promotions on storefront (sale badge, strikethrough original price, show promo price)
- [ ] Add gallery/image management: vendors can upload product gallery photos and replace existing images
- [ ] Vendor portal image upload for individual SKU gallery (multiple photos per product)

## Admin Analytics tab
- [x] Add Analytics tab to admin panel with embedded Umami dashboard
- [ ] Add product view event tracking (fire events when users view product pages)
- [ ] Show per-vendor product view breakdown in admin analytics
- [ ] Show vendor-facing analytics in vendor portal (their own product views/stats)

## StoneCreek brand (sinks + faucets)
- [x] Create StoneCreek series names for 24 faucet models with proper descriptions
- [ ] Brand sinks under StoneCreek with descriptive names
- [x] Update database with all branded names and descriptions (96 SKUs)
- [x] Build dedicated StoneCreek collection page on storefront
- [ ] Pair sinks + faucets together on product pages ("Complete this look")
- [x] Add "Add to My Design" button that sets faucet/sink in active design
- [ ] Filter StoneCreek products into the design tool surfaces palette

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
