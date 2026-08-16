
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

## Fix: Refrigerator/base overlap across all placement paths

- [x] Trace and close placement paths that allow a base cabinet to overlap a refrigerator
- [x] Centralize collision resolution before cabinet state updates are committed
- [x] Protect refrigerator surround, saved-design restore, and explicit-position placement flows
- [x] Add refrigerator/base overlap and adjacent-run regression coverage

## Feature: Collision-safe snap-to-edge alignment

- [x] Review existing cabinet and wall snapping behavior
- [x] Snap moved and newly placed cabinets flush to compatible cabinet, refrigerator, panel, and room edges
- [x] Preserve collision protection after snapping and surface an alignment indication
- [x] Add flush-alignment regression coverage and verify the designer
- [x] Verify snap-to-edge behavior in the live designer UI and capture evidence
- [ ] Launch the designer canvas and verify wall, cabinet, and refrigerator/panel edge snapping with live interactions
- [ ] Capture live in-designer evidence showing flush alignment and the snap indicator

## Fix: 3D cabinet and appliance fronts must face into the room

- [x] Trace 3D wall transforms and front-face generation for cabinets and appliances
- [x] Correct front orientation on back, front, left, and right room walls
- [x] Add regression coverage for room-facing fronts and wall-facing backs
- [ ] Verify the corrected 3D preview with a mixed cabinet and appliance layout

## Fix: Nonresponsive catalog category controls

- [x] Trace the catalog category accordion state and click handling
- [x] Correct blocked click, overlay, and event-propagation behavior
- [x] Add regression coverage for category expand and collapse behavior
- [ ] Verify category controls on desktop and mobile
- [ ] Diagnose and fix any real catalog-header click-target, overlay, z-index, or event-propagation issue
- [ ] Add UI regression coverage for accordion header clicks, expansion, and visible item rendering
- [ ] Capture live desktop and mobile interaction evidence for the repaired category controls

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
- [x] Fix Clark & Sons WR-prefix SKU resolver: W361224 must map to WR3612 (WR{width}{height}, always 24 deep)
- [x] Restore all fridge popup options that were showing before (heights, depths, widths)
- [x] Verify Clark & Sons fridge bridge cabinets resolve correctly for all widths (30, 33, 36, etc.)

## Bug: Over-fridge cabinet shows drawer band instead of two doors
- [x] Fix ElevationView.tsx: wall-placement cabinets must never show a drawer band (drawers prop must be 0 for wall cabinets)
- [x] Verify fix in browser: over-fridge cabinet shows only 2 doors, no drawer band
- [x] Restore color picker to mobile toolbar in DesignTool.tsx

## Bug: US Cabinet Depot door style shows "No cabinets available for this door style"
- [x] Investigate why selecting a US Cabinet Depot door style shows no cabinets in the design tool catalog
- [x] Fix the catalog query/filtering so USCD cabinets appear when a USCD door style is selected

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

- [x] Find the vendor/distributor listing page component
- [x] Ensure every distributor card shows a consistent arrow link (→) to its respective page
- [x] Remove any raw HTML addresses or inconsistent link rendering
- [x] TypeScript check passes; checkpoint saved

## Fix: Door sample image upload (Winchester Gray) + vendor link consistency
- [x] Add key={editingStyle.id} to EditDialog in FeaturedStylesAdmin so state resets when switching styles
- [x] Add slot prop to ImageField component and pass correct slot per upload type (door-sample, room-scene, thumbnail)
- [x] Fix VendorApplications and ProApplications website links to be consistent (ExternalLink icon + "Website" text)

## Fix: Trim items showing in Base cabinets list for all cabinet lines

- [x] Identify that catalog.ts familyCatalog returns trim items with their raw DB category (e.g. "Trim and Molding", "Base") to the Family page
- [x] Add isTrimItem() helper in catalog.ts mirroring isAccessory() from design.ts
- [x] Apply isTrimItem() in familyCatalog map: normalize trim items to category="accessory" so TYPE_FILTERS routes them to Accessories & Trim tab
- [x] Extend trimDescPattern in design.ts isAccessory() to cover: shoe molding, flat base molding, square decorative leg, outside corner molding, touch-up, sample door, spray paint
- [x] TypeScript check passes (0 errors); checkpoint saved

## Bug: Countertop gap above base cabinets in elevation view

- [x] Find countertop Y-position calculation in ElevationView.tsx (or design rendering lib)
- [x] Fix so countertop sits flush on top of base cabinets with zero gap (changed bottom from STD.COUNTERTOP_HEIGHT to STD.BASE_HEIGHT in ElevationView.tsx x2 and IslandElevationView.tsx x2)
- [x] TypeScript check passes; checkpoint saved

## Fix: Fridge cabinet positioning and panel SKU (Jul 19)

- [x] Fridge sits on the floor (elevBottom=0), default height 70" (user can change in popup)
- [x] Swap PLYB42 and REP panel button order — REP panel first (used most often)
- [x] Renamed REP9624 → REP2496 in DB (REP=fridge panel, 24=depth, 96=height); fixed width/height dimensions
- [x] TypeScript check passes; checkpoint saved

## Fix: Mobile toolbar Style/Save buttons moved to bottom (Jul 19)

- [x] Move Style and Save buttons back to the top toolbar on mobile
- [x] TypeScript check passes; checkpoint saved

## Fix: Distributor lock shows empty palette when placed cabinets differ from cart distributor (Jul 19)

- [x] Fix auto-lock effect: placed cabinets always take priority over cart lock
- [x] TypeScript check passes; checkpoint saved

## Fix: 5 mobile designer issues (Jul 19)

- [ ] #1 Cabinet pictures on mobile not matching desktop — needs user clarification on which pictures differ (awaiting user input)
- [x] #2 Add clear distributor conflict pop-up warning when adding incompatible items to cart (AlertDialog with amber warning, explains supplier conflict, offers Keep/Clear options)
- [x] #3 Fix Style/Save/More button spacing in mobile top toolbar (no overlap — compact icon-only buttons)
- [x] #4 Make room size, style, and save buttons icon-only (h-8 w-8) with tooltip on mobile top bar
- [x] #5 Add birds-eye, front view, split, and corner view buttons to mobile top toolbar
- [x] TypeScript check passes; checkpoint saved

## Fix: 5 issues (Jul 19 batch 2)

- [ ] #1 Add door style filter buttons (All Styles, Shaker, Raised Panel, Flat Panel) to designer door style picker
- [ ] #2 Add color filter buttons (White, Grey, Off White, Tan, Dark, Light Stain, Grey Stain, Tan Stain, Dark Stain) to designer door style picker
- [ ] #3 Add smooth fade-in animation to distributor conflict dialog; ensure it centers on all mobile screens
- [ ] #4 Fix hover tooltips on mobile top toolbar: appear instantly, don't get cut off by screen edges
- [ ] #5 Fix default language: English should be the default (not Chinese)
- [ ] TypeScript check passes; checkpoint saved

## Fix: Jul 19 batch 2 — filter pills, dialog animation, room size button

- [x] #1 Add door style filter buttons (All Styles, Shaker, Raised Panel, Flat Panel) to designer door style picker (ColorSlotButton.tsx)
- [x] #2 Add color filter buttons (White, Grey, Off White, Tan, Dark, Light Stain, Grey Stain, Tan Stain, Dark Stain) to designer door style picker (ColorSlotButton.tsx)
- [x] #3 Add smooth fade-in animation to distributor conflict dialog; ensure it centers on all mobile screens (mx-4 sm:mx-auto animate-in fade-in-0 zoom-in-95 duration-200)
- [x] #4 Mobile top toolbar tooltips use native title attributes — no Radix tooltip clipping possible
- [x] #5 Fix default language: English is default (storefrontI18n.ts — Chinese browser detection removed)
- [x] #6 Mobile room size button now opens dedicated Room Size sheet (mobilePanel="room") instead of More sheet
- [x] TypeScript check passes; checkpoint saved

## Feature: Feet/meters toggle + mobile Undo/Redo (Jul 20)

- [x] Add ft/m toggle switch to RoomSizeControl (desktop popover) — converts displayed values between feet/inches and meters
- [x] Add ft/m toggle switch to RoomSizeInline (mobile sheet) — same behavior
- [x] Add Undo and Redo icon buttons to mobile top toolbar (next to existing view buttons)
- [x] TypeScript check passes; checkpoint saved

## Feature: Series name in door style description (Jul 20)

- [x] Show series name in parentheses after style/color name on door style page: Clark & Son = Ashford, Milestone/Skyline = Preston, USCD = Madison
- [x] TypeScript check passes; checkpoint saved

## Feature: Door style search bar (Jul 20)

- [x] Search bar at top of door style picker filters by style name, color, and series name (real-time, desktop + mobile)
- [x] TypeScript check passes; checkpoint saved

## Feature: Potential Merge Detection (SKU overlap detection)
- [x] Server procedure: detect SKU overlaps between cabinets and return merge candidates
- [x] Admin UI: PotentialMergesAdmin component with Accept (set alias) and Dismiss actions
- [x] Wire into Products & Catalog tab with badge count
- [x] TypeScript check passes; checkpoint saved

## Fix: Remove auto-hide from alias procedures (aliases are cross-references only)
- [x] Remove auto-hide logic from catalog.ts adminUpdateCabinet
- [x] Remove auto-hide logic from genericCabinets.ts update and bulkUpdateAliases
- [x] Update Aliases tab note: aliases are cross-references, not hide triggers
- [x] Restore B12 visibility (was hidden by old auto-hide logic) — confirmed active in DB (isActive=1, conflict=none)

## Feature: Banner Management Admin
- [x] Add banners table to drizzle/schema.ts
- [x] Run migration SQL for banners table
- [x] Add tRPC procedures: banners.adminList, banners.adminCreate, banners.adminUpdate, banners.adminDelete, banners.adminSetActive, banners.getActive
- [x] Build BannerAdmin component with list, active toggle, create/edit form, live preview, holiday presets
- [x] Add Banner Management tab to admin Settings section
- [x] Wire storefront top banner bar to fetch active banner from database (StorefrontBanner component)
- [x] Pre-seed holiday banners (4th of July, Labor Day, Thanksgiving, Christmas, New Year, Memorial Day, Black Friday, Spring Sale)

## Fix: Refrigerator Options dialog — all 3 cabinet lines
- [x] Server deepAbove query: add REGEXP for W[WW][HH]GD (Skyline + USCD glass-door 12"-deep SKUs)
- [x] Server endPanels sort: REP2496 (Clark & Sons) first, then REPV* standard, then REPVKIT, then REP9*, then PLY
- [x] Client parseSkuDims (RefrigeratorOptionsDialog): add Format 5 for W[WW][HH]GD before 8-char match
- [x] Client parseCabDims (DesignTool): add GD-suffix match before 8-char match
- [x] TypeScript: 0 errors; checkpoint saved

## Fix: Spreadsheet upload — new door styles blocked
- [x] Add "Create new door style" sub-panel to StyleSearchDropdown in DistributorImport.tsx
- [x] Uses distributorAdmin.addDoorStyle mutation to create style for the distributor and immediately assign it to the column
- [x] Discontinued/deleted SKUs correctly show as unmatched (expected behavior, not a bug)
- [x] TypeScript: 0 errors; checkpoint saved

## Data: Skyline XLSX import (skyline.xlsx)
- [x] Created 31 new Skyline door styles (SW, SE, NB, AG, IB, SA, LG, SB, TC, RW, AW, AC, DSG, DDW, CW, SDW, SAG, SIB, SAO, SWO, HW, HG, MB, MI, OB, OS, CG, MG, FW, FG, FE)
- [x] GR (Shaker Gray) skipped per user request — already exists
- [x] 343 SKUs imported (312 matched existing cabinets, 31 new cabinets created)
- [x] 6,430 price rows upserted and published
- [x] 7 rows skipped (trays, crown moulding, finished panel, waste bin — no category match)
- [x] Checkpoint saved

## Feature: Scoped cabinet image upload (admin)
- [x] Add imageUrl column to distributor_cabinet_overrides table
- [x] Add cabinetOverrides.setImage tRPC procedure (scope: "line" | "global")
- [x] Add distributorImageUrl to stylesForCabinet response (from distributor_cabinet_overrides)
- [x] CabinetImage component accepts overrideImageUrl prop — line image takes priority over master
- [x] Add "Replace image" button on CabinetDetail (admin only) with scope dialog (this line / all lines)

## Feature: Front-end cabinet edit — category + published status
- [x] Add category selector to admin edit dialog on CabinetDetail page
- [x] Add published/hidden toggle to admin edit dialog on CabinetDetail page
- [x] Wire both fields to adminUpdateCabinet procedure (already supports them)
- [x] Checkpoint saved

## Feature: Affiliate CRM Dashboard — full build (Jul 20)
- [x] Add affiliateBannerSchedules and affiliatePromoDiscounts to Drizzle schema
- [x] Implement banner schedule procedures (getBannerSchedules, upsertBannerSchedule, deleteBannerSchedule) with real DB queries
- [x] Add promoDiscounts procedures (getPromoDiscounts, upsertPromoDiscount, deletePromoDiscount) to affiliates router
- [x] Add myConsultations procedure to affiliates router (affiliate-scoped design appointments)
- [x] Add storefront.activeBannerAndPromos procedure (returns active banner + promo badges for a slug)
- [x] Add Promotions tab to affiliate dashboard (banner library picker + sale badge editor per door style)
- [x] Add Appointments tab to affiliate dashboard (view/manage design consultation bookings)
- [x] Wire Promotions and Appointments into AffiliateDashboardLayout nav and AffiliateDashboard switch
- [x] Show sale badge overlay (red badge) on door style cards in affiliate storefront FamilyPicker
- [x] Show active banner bar at top of affiliate storefront (dismissible, fetched from DB)
- [x] TypeScript: 0 errors; checkpoint saved

## Fix: White Shaker family page category filter tabs (Jul 20)

- [x] Verify all filter tabs (All Cabinets, Base, Wall, Tall & Pantry, Vanity, Trim & Accessories) correctly filter the White Shaker cabinet list
- [x] Investigate why a filter tab may show "No cabinets match this filter" when cabinets exist
- [x] Fix category mismatch: DB stores "Trim and Molding", "Accessories", "Specialty", "Molding", "Filler's and Panels" but filter only matched "accessory"
- [x] Fix: updated TYPE_FILTERS to match all DB category variants (case-insensitive via .toLowerCase())
- [x] Fix: Base tab now also includes "corner" category cabinets
- [x] Ensure the filter works for all door styles, not just White Shaker
- [x] TypeScript check passes; checkpoint saved

## Fix: FRIDGE cabinet elevation rendering (Jul 20)

- [x] FRIDGE-36 renders with door panel lines for Preston style but should be a plain flat panel (no door details) like Ashford
- [x] Root cause: older saved designs stored placement:"tall" for FRIDGE-* items; elevation view checked placement field only
- [x] Fix 1: ElevationView.tsx isAppliance check now also checks masterCode.startsWith("FRIDGE-") and "RANGE-"
- [x] Fix 2: loadSavedDesign normalizes placement:"appliance" for any FRIDGE-*/RANGE-* cabinet on load
- [x] Fix 3: localStorage draft restore also normalizes appliance placement
- [x] TypeScript check passes; checkpoint saved

## Fix: Madison over-fridge cabinet "No 24×24 available" error (Jul 20)

- [x] Error: "No 24″ × 24″ cabinet available for this style" when selecting 24″ deep over-fridge cabinet for Madison style
- [x] Root cause: USCD bridge/fridge wall cabinet SKUs (OW-W3012, OW-W301224, etc.) were missing from distributor_skus table
- [x] Fix 1: Inserted 456 distributor_skus rows linking all 24 bridge/fridge cabinet types to all 19 USCD styles
- [x] Fix 2: Updated surroundForFridge server query to match USCD 4-char (W3012) and 6-char (W301224) SKU patterns
- [x] Fix 3: Added auto-correct useEffect to switch depth when height changes and current depth has no match
- [x] Fix 4: Depth buttons now show strikethrough/disabled when no matching cabinet exists at that depth
- [x] TypeScript check passes; checkpoint saved

## Fix: Elevation view — all cabinets must show correct door face for all lines, styles, colors (Jul 21)

- [x] Add drop shadow to outer cabinet container so all cabinets visually lift off the wall (fixes white-box effect for light-colored finishes)
- [x] Add keyword matches for Skyline style names that currently fall to fallback: "Treasure Chest" (warm brown), "Rustic Wood" (warm oak), "Midnight Glass" (dark/near-black slab)
- [x] Add keyword matches for "blonde", "charcoal" (Aspen Charcoal), "iron" (Slim Iron Black), "aston" (Slim Aston Green), "dove" for Slim Dove White
- [x] Verify doorPanelKind handles "Slim Shaker" doorStyle correctly (already handled by regex)
- [x] Verify finishColors handles hex color codes from USCD styles correctly (already handled)
- [x] Verify all cabinet types (single-door, double-door, drawer-base, pantry, sink-base, blind-corner, glass-door) render correctly with finish color and door style
- [x] TypeScript check passes; checkpoint saved

## Fix: Elevation rendering bugs — FRIDGE, B36 doors, B12FH (Jul 21)

- [x] FRIDGE-36: Must show the cabinet face (finish color + door style), NOT the steel appliance box — remove the FRIDGE/RANGE masterCode check from isAppliance so refrigerator cabinets render as real cabinet faces
- [x] B36 (36" base with drawers + door): The door portion below the drawers shows incorrectly — investigate why the door panel area has a visible orange/warm stripe at the top and fix the face fill gradient for the door region
- [x] B12FH (12" single door base): Shows a white/light box — the face frame is light Oxford Mist against the warm beige wall; fix by ensuring the drop shadow is applied correctly and the face fill is solid
- [x] All single-door base cabinets: Must show the full shaker door face (stiles + rails + recessed panel) in the correct finish color with no visible box artifact
- [x] TypeScript check passes; screenshot verified; checkpoint saved

## Fix: Base cabinet elevation — toe kick + full face + countertop (Jul 21)

- [x] Remove duplicate per-cabinet countertop slab renderer (lines 922-956 in ElevationView.tsx) — renders always even without countertop selected, causing orange stripe at top
- [x] Fix face fill to cover the full face area from toe kick top to countertop bottom — no interior/wall color showing through
- [x] Ensure toe kick renders at the bottom of every base cabinet (dark strip ~4.5" tall)
- [x] Remove FRIDGE-* from isAppliance so fridge cabinets render as real cabinet faces (finish color + door style)
- [x] Verify correct layering: toe kick (bottom) → full cabinet face → countertop (top)
- [x] TypeScript check passes; screenshot verified; checkpoint saved

## Fix: Cabinet face fill gap — interior/wall color showing at top of ALL cabinets (Jul 21)

- [x] ALL cabinets (base AND wall) show an orange/warm stripe at the top — the interior is showing through a gap at the top of the face fill
- [x] Root cause: outer container was transparent; face fill (withFace absolute inset-0) had a sub-pixel gap at the top
- [x] Fix: set outer cabinet container background to faceFill color directly — no interior shows through regardless of DoorFront rendering
- [x] Wall cabinets: same issue fixed — orange stripe at top of W2136, W2736 eliminated
- [x] Base cabinets: orange stripe at top + white stripe below countertop fixed
- [x] The countertop slab (per-cabinet duplicate removed) — contiguous-run renderer still works correctly
- [x] TypeScript check passes; screenshot verified; checkpoint saved

## Fix: B12FH, B18FH, B36FH countertop stripe at top (Jul 21)

- [x] B12FH, B18FH, B36FH show warm/orange stripe at top of cabinet face — countertop slab overlapping or z-index issue
- [x] Root cause: sub-pixel rounding at fractional PPI values causes countertop slab to bleed 1px below cabinet top edge
- [x] Fix: Math.ceil(STD.BASE_HEIGHT * ppi) on countertop slab bottom ensures slab never bleeds into cabinet face
- [x] 3DB36 is correct — drawer base rendering unchanged
- [x] TypeScript check passes; checkpoint saved

## Master SKU Alias Program (Catalog Governance)

- [x] Create DB schema: sku_master_aliases table (alias_code, master_code, created_at, created_by, conflict_status)
- [x] Create DB schema: sku_merge_suggestions table (id, alias_code, master_code, similarity_score, reason, status, reviewed_by, reviewed_at)
- [x] Create DB schema: sku_matching_rules table (id, rule_name, weight, enabled)
- [x] Apply DB migrations via webdev_execute_sql
- [x] Backend: tRPC procedures for suggestions (list, approve, dismiss)
- [x] Backend: tRPC procedures for aliases (list, delete, update)
- [x] Backend: conflict resolution — if alias already mapped, revert to oldest mapping
- [x] Backend: AI similarity detection using built-in LLM
- [x] Backend: tRPC procedure to manually trigger AI duplicate scan
- [x] Admin UI: MasterSkuAdmin component with Suggestions/Aliases/Rules tabs
- [x] Admin UI: Suggestion card with approve/dismiss + similarity score badge
- [x] Admin UI: Alias mapping table with search + conflict status badge
- [x] Admin UI: Run AI Scan button with confirmation dialog
- [x] Admin UI: Wired into Products & Catalog group in AdminGroupedTabs as "Master SKU Aliases" tab
- [x] Vitest tests: 19 tests passing for normalize, levenshtein, editSimilarity, duplicate detection, conflict detection, deduplication

## Feature: Floating cabinet style selector on product detail page (Jul 21)
- [x] Identify the floating style selector component used on the catalog listing page (sticky pill in Family.tsx)
- [x] Add the same floating style selector to the individual product detail page (breadcrumb row, right-aligned pill with DoorStyleSwatch thumbnail + style name + chevron)
- [x] Clicking the pill scrolls to #pricing section where the full style picker lives
- [x] TypeScript compiles cleanly; screenshot verified; checkpoint saved

## Feature: Approve All + alias-aware product page (Jul 21)
- [x] Add "Approve All" bulk action button to Suggestions tab (approves all pending suggestions in one click, with confirmation dialog)
- [x] Backend: approveAll tRPC procedure in masterSku router (bulk-approves all pending, handles conflicts)
- [x] Update stylesForCabinet query to resolve alias cabinet IDs via sku_master_aliases so distributor pricing rows with aliased codes appear on the product detail page
- [x] TypeScript check passes; checkpoint saved

## Fix: AI scan false positives from numeric differences (Jul 21)
- [x] Add hasDifferentNumbers() guard: reject any pair where normalized codes differ in their numeric segments (different numbers = different cabinet size, never a duplicate)
- [x] Remove fuzzy edit-distance pass (80-94% score range) entirely — only keep hyphen/space-stripping pass (95%+) and alias-field cross-reference (90%)
- [x] Clear all existing pending suggestions (false positives) from the DB — fresh start for next scan
- [x] TypeScript check passes; checkpoint saved

## Feature: "Not a cabinet" flag on product edit (Jul 21)
- [x] Check DB schema: isNotCabinet boolean column exists in cabinets table (schema.ts line 161)
- [x] No migration needed: column already exists
- [x] Backend: isNotCabinet exposed in catalog.ts adminUpdateCabinet (line 1441) and byCode (line 1943)
- [x] Admin edit form: "Not a Cabinet" toggle already exists in CabinetConfigAdmin.tsx
- [x] Product detail page: door style selector wrapped in {!cabinet?.isNotCabinet && ...} conditional
- [x] TypeScript check passes; checkpoint saved

## Feature: Number of Doors field on admin edit (Jul 21)
- [x] numberOfDoors column already exists in cabinets schema (int, default 0)
- [x] Admin edit form already has Number of Doors selector (0, 1, 2, 3, 4) in CabinetConfigAdmin.tsx
- [x] Backend already exposes numberOfDoors in adminUpdateCabinet and byCode procedures
- [x] Elevation renderer: updated resolveDoorDrawerCounts to treat numberOfDoors/numberOfDrawers as hard admin overrides (priority 0, before description parsing) — except for pure drawer-base codes (DB-*, 2DB*)
- [x] isNotCabinet: door style selector hidden on product detail page when flag is set
- [x] TypeScript check passes; checkpoint saved

## Feature: Floating style pill always visible on Family page (Jul 21)
- [x] Family.tsx: style pill now always visible in the sticky filter bar (not just after hero scrolls away)
- [x] Pill shows door thumbnail + style name + chevron; clicking scrolls to top of page
- [x] TypeScript compiles cleanly; checkpoint saved

## Fix: AG2418 Appliance Garage placement in designer (Jul 21)
- [x] AG2418 mounts at 36" from floor (on countertop) up to 54" (36"+18" height)
- [x] Fixed elevationBox in design.ts: added branch 2b that detects appliance garages (via /appliance garage|\bag-?\d/ regex) and returns { bottom: STD.COUNTERTOP_HEIGHT (36"), height: h } before the short-wall top-anchor branch
- [x] Explicit mountBottom user override (branch 1) still wins if user drags it
- [x] TypeScript check passes; checkpoint saved

## Feature: Aliases tab in cabinet edit dialog (Jul 21)
- [x] Cabinet edit dialog: Aliases tab shows all alias codes pointing to this cabinet's masterCode
- [x] Aliases tab: add new alias code field (text input + Add button)
- [x] Aliases tab: list existing aliases with a remove (X) button per row
- [x] On save/add: upsert into sku_master_aliases (aliasCode → masterCode, status=approved, createdBy=admin)
- [x] On remove: delete from sku_master_aliases
- [x] Backend: tRPC procedures getAliasesForCabinet(masterCode) and addAliasForCabinet(aliasCode, masterCode)
- [x] TypeScript check passes; checkpoint saved

## Feature: Smart Fill for weight & dimensions (Jul 21)
- [x] Backend: adminEstimateMeasurements upgraded to 3-tier strategy (master sheet → distributor overrides → alias siblings → AI fallback)
- [x] Tier 1: If cabinet already has weight/pkgLength/pkgWeight in DB, return those immediately with source="master_sheet"
- [x] Tier 2: Check distributor_cabinet_overrides for this cabinet; use first row with weight or pkg data, source="distributor_override"
- [x] Tier 2b: Check sku_master_aliases for sibling cabinets; borrow their stored dimensions, source="alias_sibling"
- [x] Tier 3: AI fallback — LLM prompt enhanced with "use publicly available specs" instruction, source="ai_estimate"
- [x] Response now includes `source` and `sourceLabel` fields
- [x] UI: Button renamed "Smart Fill"; shows "Filling…" while pending
- [x] UI: Source label shown below description with green checkmark after fill
- [x] UI: Hint text shown when all weight/pkg fields are empty
- [x] TypeScript check passes; checkpoint saved

## Feature: Blind Corner Pull Data in Admin Edit Dialog (Jul 21)
- [x] Backend: add minPull, maxPull, openingWidth to adminUpdateCabinet input schema and mutation handler
- [x] Backend: add minPull, maxPull, openingWidth to adminListCabinetConfig return fields
- [x] Admin UI: detect isBlindCorner(masterCode, description) and show "Blind Corner Pull Spec" section
- [x] Admin UI: minPull and maxPull number inputs (required for blind corners, shown only when isBlindCorner)
- [x] Admin UI: openingWidth number input (optional, shown only when isBlindCorner)
- [x] Admin UI: CabinetRow type extended with minPull, maxPull, openingWidth
- [x] Admin UI: handleSave passes minPull, maxPull, openingWidth to updateMutation
- [x] Designer: pullMin/pullMax from DB already flow through design.ts router — no changes needed (confirmed)
- [x] TypeScript check passes; checkpoint saved

## Fix: Wall Cabinet Door Sample Image Shows Drawer Front on Top
- [x] Root cause: door sample photos are base-cabinet combo shots (drawer front on top + door below); when applied as background-size:cover on wall cabinet panels, the drawer portion shows at the top
- [x] Fix: RecessedPanel and SingleDoorPanel now accept isWall prop; when isWall=true, background-position is "center 80%" to anchor to the door portion of the image
- [x] All 7 SingleDoorPanel call sites in DoorFront updated to pass isWall={isWall}
- [x] All door style cases (shaker, slim-shaker, raised, beaded, inset, slab, double-shaker) updated
- [x] TypeScript check passes; checkpoint saved

## Feature: Separate Door Sample and Drawer Sample Images
- [ ] DB: add drawer_sample_image_url column to door_styles table
- [ ] Migration: generate and apply SQL for new column
- [ ] Backend: expose drawerSampleImageUrl in getDoorStyles and adminUpdateDoorStyle procedures
- [ ] Admin UI: add Drawer Sample image upload field alongside existing Door Sample field
- [ ] ElevationView: wall cabinets skip door sample photo entirely (CSS-only rendering)
- [ ] ElevationView: base cabinet door panels use doorSampleUrl (bottom of photo / center)
- [ ] ElevationView: base cabinet drawer fronts use drawerSampleUrl (top of photo / center top)
- [ ] ElevationView: StylePanel drawer=true uses drawerSampleUrl when available
- [ ] TypeScript check passes; checkpoint saved

## Feature: Door & Drawer Location Diagram
- [x] Build DoorDrawerDiagram SVG component — labeled front-elevation schematic showing door/drawer zones
- [x] Integrate diagram into CabinetDetail product page (below Specifications card)
- [x] Integrate diagram into CabinetConfigAdmin edit dialog (live preview below Doors/Drawers selectors)
- [x] TypeScript check passes; checkpoint saved

## Fix: Door & Drawer Diagram — Oven Cabinet Layout
- [x] Detect oven cabinets by code prefix (O3x, UOC) and description keyword
- [x] Render oven cabinets as: top doors → gray oven opening cutout → stacked drawers at bottom
- [x] Fall back to description parsing for oven cabinet door/drawer counts when DB has 0/0
- [x] Update legend to show Doors + Drawers + Oven Opening for oven cabinets
- [x] TypeScript check passes; checkpoint saved

## Feature: Appliance Opening Type in Cabinet Config Admin
- [x] Add openingType column to cabinets table (top/middle/bottom/null)
- [x] Generate and apply migration SQL for openingType column
- [x] Add Appliance Opening selector to CabinetConfigAdmin form (None/Top/Middle/Bottom)
- [x] Wire openingType to tRPC update procedure and adminListCabinetConfig query
- [x] Update DoorDrawerDiagram to use openingType DB field for layout (top/middle/bottom positions)
- [x] Rename "Oven Opening" to "Appliance Opening" throughout diagram and legend
- [x] Add openingType to placeableCabinets query so Design Tool gets the field
- [x] Add openingType to CabinetLike interface in cabinetGraphics.ts
- [x] TypeScript check passes; checkpoint saved

## Feature: Last Saved Date in Cabinet Config
- [x] Add updatedAt timestamp field to cabinets table schema (auto-updates on every save)
- [x] Run migration to add updatedAt column to cabinets table
- [x] Return updatedAt from adminListCabinetConfig query
- [x] Add "Last Saved" column to Cabinet Config list table (visible on lg+ screens)
- [x] Format date as "Jul 22, 2026" style in the list rows

## Fix: Range Top renders on top of cabinet (not covering full face)
- [x] Change range top from full-face panel (34.5" tall) to thin cooktop strip (3.5" tall) at countertop level
- [x] Position cooktop at bottom: STD.BASE_HEIGHT (34.5") so it sits ON TOP of the cabinet box
- [x] Revert isBridgeable exclusion — countertop slab still runs under the cooktop (cooktop at z-22 covers it)
- [x] Burners arranged in single row of 4 (thin/wide panel) instead of 2x2 grid
- [x] TypeScript check passes; checkpoint saved

## Improvement: Realistic surface rendering in Elevation View
- [x] Flooring pattern: staggered plank joints (not straight grid) for hardwood/LVP look
- [x] Countertop: realistic quartz/stone texture with subtle veining instead of flat color
- [x] Backsplash: improve tile pattern realism (grout lines, depth, proper subway offset)
- [x] Sink: realistic basin shape with shadow/depth instead of flat outline
- [x] Faucet: realistic metallic rendering with highlights instead of simple line art

## Feature: Toggle between realistic and simplified elevation rendering
- [x] Add a toggle button in the elevation view toolbar to switch between "Realistic" and "Simplified" rendering modes
- [x] When simplified: use original flat colors for flooring, countertop, backsplash, faucet, and sink
- [x] When realistic: use the new staggered planks, veining, metallic faucet, etc.
- [x] Persist the preference in localStorage so it remembers across sessions

## Feature: Cabinet company selector button
- [x] Add a button to choose one of 3 cabinet companies, placed to the right of the door style sample in the design tool

## Feature: Export elevation view as PNG
- [x] Add an export button that downloads the current elevation rendering as a high-quality PNG image

## Feature: Cabinet config verified checkmark + front-end parity + door orientation

- [x] Add "verified" boolean field to cabinets schema (admin can mark a cabinet as fully reviewed)
- [x] Show verified checkmark badge on cabinet list/cards in admin so you can see at a glance which are done
- [x] Add "Mark as Verified" button in both front-end and back-end Edit Cabinet dialogs
- [x] Front-end Edit Cabinet parity: show all dimension fields (Width, Height, Depth, Physical Width, Weight)
- [x] Front-end Edit Cabinet parity: add "Not a cabinet" (isAccessory) toggle
- [x] Front-end Edit Cabinet parity: support up to 4 door configurations (currently only 2 on front-end)
- [x] Add door orientation field: "side-by-side" (horizontal) vs "stacked" (vertical) for multi-door cabinets
- [x] Show door orientation in the Edit Cabinet dialog on both front-end and back-end

## Feature: Floating category pills on individual cabinet detail page
- [x] Add floating category pills (Base, Wall, Tall, Vanity, Accessory, Molding) to the CabinetDetail page that filter within the current door style
- [x] Add a search input within the category pills to search cabinets within that door style
- [x] Clicking a category pill shows a scrollable list/grid of cabinets in that category for the same door style

## Feature: Replace room scene hero with expanded category browser on cabinet detail page
- [x] Remove the "Build This Look" room scene hero image from the cabinet detail page
- [x] Replace with an expanded grid/list of all cabinets in the current category for the same door style

## Feature: Corner type dropdown in front-end CabinetDetail edit dialog
- [x] Add cornerType state + hydration to CabinetDetail edit dialog
- [x] Add Corner Cabinet Type dropdown (Lazy Susan, Blind Corner, Diagonal, Pie-Cut, L-Shape) to the edit form
- [x] Include cornerType in handleSaveEdit mutation payload
- [x] Backend already accepts cornerType — no server changes needed
- [x] TypeScript check passes; checkpoint saved

## Feature: Admin Categories & Sub-Categories management page
- [x] Create cabinet_categories and cabinet_sub_categories DB tables
- [x] Seed tables with existing hardcoded categories and sub-categories
- [x] Build backend tRPC CRUD procedures (create/update/delete/reorder for categories and sub-categories)
- [x] Build admin UI page (CategoriesAdmin) with expand/collapse, inline edit, add, delete
- [x] Add "Categories" tab to Products & Catalog group in admin panel
- [x] Wire CabinetDetail edit dialog category/sub-category dropdowns to use dynamic DB list
- [x] Wire CabinetConfigAdmin category filter to use dynamic DB list
- [x] Wire FullDatabaseExport category filter to use dynamic DB list
- [x] TypeScript compiles cleanly; checkpoint saved

## Feature: Appliance Opening Position selector in front-end CabinetDetail edit dialog
- [x] Add editOpeningType state + hydration from cabinet.openingType
- [x] Add Appliance Opening dropdown (Top / Middle / Bottom) to the edit form
- [x] Include openingType in handleSaveEdit mutation payload
- [x] Backend already accepts openingType — no server changes needed
- [x] TypeScript compiles cleanly

## Feature: Door height field for accurate elevation rendering
- [x] Add doorHeight column to cabinets table in DB schema
- [x] Add doorHeight to backend update mutation (catalog.ts)
- [x] Add doorHeight input to CabinetDetail front-end edit dialog
- [x] Add doorHeight input to CabinetConfigAdmin
- [x] Update elevation renderer (DoorDrawerDiagram / ElevationView) to use doorHeight from config data
- [x] Carry openingType, doorHeight, doorOrientation from catalog to PlacedCabinet when placed on canvas
- [x] Add appliance opening rendering section for non-oven-tall cabinets (MW3042 microwave wall cabs)
- [x] Ensure MW3042 and similar cabinets render with correct door proportions based on config

## Bug Fix: Cabinets not updating in design tool after category change
- [x] Root cause: placementType field not updated when category changed in admin
- [x] Fix: Auto-derive placementType from category in both catalog update mutations
- [x] Fix existing mismatched data (U-18-84-24, U-18-90-24, U-18-96-24 → tall; TK-8 → accessory)
- [x] Bulk sync all cabinets where placementType didn't match category

## Feature: Drawer height field for accurate rendering
- [x] Add drawerHeight column to cabinets table in DB schema
- [x] Add drawerHeight to backend update mutation (catalog.ts)
- [x] Add drawerHeight input to CabinetDetail front-end edit dialog (shown when drawers > 0)
- [x] Add drawerHeight input to CabinetConfigAdmin
- [x] Update DoorDrawerDiagram and ElevationView to use drawerHeight from config

## Bug: DoorDrawerDiagram shows "Door" zone when doors = 0 (BMC-27)
- [x] DoorDrawerDiagram should not render a door section when numberOfDoors is set to 0/None
- [x] When doors=0 and openingType is set, diagram should show only: opening + drawers (no door zone)
- [x] TypeScript check passes; checkpoint saved

## Bug: 18" pantry (U-18) renders side-by-side doors instead of stacked
- [x] Pantry rendering should use numberOfDoors from admin config to determine layout
- [x] 18" wide pantry should show single stacked doors (1 top + 1 bottom), not 2+2 side-by-side
- [x] ElevationView pantry rendering should respect admin numberOfDoors setting
- [x] TypeScript check passes; checkpoint saved

## Feature: Directional nudge buttons (up/down/left/right) for selected cabinet in designer
- [x] Add arrow button UI (d-pad style) that appears when a cabinet is selected
- [x] Wire buttons to move the selected cabinet by a small increment (e.g. 1 inch) in the chosen direction
- [x] Ensure movement respects wall boundaries (uses clampCabinetsToRoom)
- [x] TypeScript check passes; checkpoint saved

## Feature: Flooring improvements in design tool
- [x] Delete flooring when a design/plan is deleted (clear flooringMaterialId + flooringPattern + selectedSurfaces)
- [x] Add flooring pattern selection (Random Stagger, 1/3 Offset, Diagonal, Herringbone) in Surfaces palette
- [x] Flooring products already come from real Pelican inventory; rendering now properly changes per product + pattern
- [x] TypeScript check passes; checkpoint saved

## Feature: Move products between categories in admin panel
- [x] Add "Move to Category" button in the bulk action bar (when products are selected)
- [x] Show a dialog with category dropdown (existing categories) + option to create new category
- [x] Also allow changing sub-category in the same dialog
- [x] Bulk update category/subCategory for all selected products via bulkMoveCategory procedure
- [x] TypeScript check passes; checkpoint saved

## Feature: Door style admin management
- [x] Add activate/deactivate toggle for door styles (already existed)
- [x] Add delete functionality for door styles
- [x] Add ability to create new door styles from admin
- [x] Show total line item count (SKUs carried) per door style on admin page
- [x] TypeScript check passes; checkpoint saved

## Bug: Cabinet edit fails with "Failed query" when dimension fields contain fractions or empty strings
- [x] Fix server-side adminUpdateCabinet to convert fraction strings (e.g. "7/16") to decimal values before DB write
- [x] Fix server-side to convert empty strings to null for decimal columns
- [x] Fix client-side CabinetConfigAdmin handleSave to convert empty strings to null before sending
- [x] TypeScript check passes; checkpoint saved

## Merge Cabinets Admin Tool

- [x] Add backend mergeCabinets procedure (moves SKUs, overrides, updates aliases, deactivates loser)
- [x] Build Merge Cabinets admin UI with search/select two cabinets, side-by-side comparison, and merge button
- [x] Show catalog images side-by-side in merge comparison
- [x] Show dimensions side-by-side for comparison
- [x] Blind corner warning when merging blind corner cabinets
- [x] Confirmation dialog before executing merge
- [x] Manual merge tab: search for any two cabinets and merge them
- [x] Wire route into admin navigation (already existed as Merge Suggestions tab)

## Image Replacement Confirmation Dialog

- [x] When uploading a new catalog image and one already exists, show confirmation: "Replace for all distributors?"
- [x] "Yes, replace for all" → updates master cabinet catalogImageUrl (applies globally to all distributors)
- [x] "No, just this distributor" → saves to distributor_cabinet_overrides.imageUrl for that specific distributor
- [x] Show the designer rendering (DoorDrawerDiagram) in the confirmation dialog so admin sees what it looks like in the design tool
- [x] Wire the dialog into the handleFile flow in CabinetConfigAdmin
- [x] Save checkpoint

## Diagonal/Angled Cabinet Templates in DoorDrawerDiagram

- [x] Add `diagonal-corner` type to CabinetDrawingType enum and detection logic (DCW, WDC, DCB, AW codes)
- [x] Add `l-corner` type for lazy Susan / easy-reach cabinets (LS, ER codes)
- [x] Implement diagonal-corner SVG in DoorDrawerDiagram (pentagon outline with angled front face + door panels)
- [x] Implement l-corner SVG in DoorDrawerDiagram (L-shape with doors on both faces)
- [x] Add DiagonalCornerFront and LCornerFront SVG components to CabinetDrawing.tsx
- [x] Add diagonal-corner and l-corner rendering branches to ElevationView.tsx
- [x] Update cabinetTypeLabel and cabinetAltText for new types
- [x] Update tests to reflect new type classifications
- [x] Save checkpoint

## Photorealistic 3D Cabinet Preview on Product Detail Page

- [x] Create backend procedure to generate photorealistic AI image of a specific cabinet in a chosen door style/color
- [x] Cache generated images (keyed by cabinet masterCode + door style ID) in S3 so same combo doesn't regenerate
- [x] Add 3D preview section to the product detail page showing the AI-generated image
- [x] Include prominent "Add to Designer" CTA button below the preview that opens the design tool pre-loaded with that cabinet style
- [x] Ensure the preview uses the customer's currently selected door style/color
- [x] Handle loading state while image generates (spinner/skeleton with "Generating your cabinet preview...")
- [x] Run typecheck and tests
- [x] Save checkpoint

## Add DoorDrawerDiagram thumbnail preview to admin cabinet list rows

- [x] Show two thumbnails per row: catalog image (left) + DoorDrawerDiagram rendering (right)
- [x] Keep the thumbnails small (40px) so they don't bloat the table but give visual identification
- [x] Save checkpoint

## Drawer Layout Configuration (row-based grid)

- [x] Add a `drawerLayout` JSON field to the cabinets table (stores array of rows: [{count, height?}])
- [ ] Add Drawer Layout row editor in the admin CabinetConfigAdmin edit modal (Config tab) — add/remove rows, set count per row, optional height
- [ ] Update DoorDrawerDiagram to render drawers per-row (side-by-side within each row, rows stacked vertically)
- [ ] Update ElevationView to render drawers per-row when configured
- [ ] Default behavior: if no drawerLayout JSON, fall back to current behavior (all drawers full-width stacked)
- [ ] Equal height split when heights not specified; equal width split within each row
- [x] Save checkpoint

## Flat Panel Rendering in DoorDrawerDiagram

- [x] Add `parseDrawerLayout` and `renderDrawerRows` helper functions to fix compilation error
- [x] Add `'panel'` type to CabinetDrawingType enum in cabinetGraphics.ts
- [x] Add panel detection logic (category/subCategory/code patterns for skin panels, end panels, plywood panels)
- [x] Add `grainDirection` field to CabinetLike interface and cabinets table
- [x] Implement flat panel rendering branch in DoorDrawerDiagram: simple rectangle with measurements (W×H), label, and grain direction arrow
- [x] Update cabinetTypeLabel and cabinetAltText for panel type
- [x] Add grainDirection field to admin CabinetConfigAdmin edit modal
- [ ] Save checkpoint

## Remove AI 3D Preview Feature (unreliable)

- [ ] Remove the "See It in 3D" button and AI generation section from the product detail page
- [ ] Keep catalog line drawing + door sample image + "Put This in the Designer" button
- [ ] Clean up unused AI 3D preview code (server mutation, prompt builder, etc.)
- [ ] Save checkpoint

## Hide Door & Drawer Layout Diagram from Public

- [x] Hide the "Door & Drawer Layout" section on product detail page from public customers (only show in admin mode)

## Replace AI 3D Preview with Room Scene Photo

- [x] Replace the AI-generated 3D preview in Cabinet3dPreviewSection with the selected door style's room scene image
- [x] Show the room scene photo immediately (no loading/generation) when user clicks or views the section
- [x] Keep the "Put This in the Designer" button below it

## Corner Swatch Feature

- [x] Add `cornerSwatchImageUrl` column to door_styles table (schema + migration + SQL)
- [x] Add cornerSwatchImageUrl to admin door style edit/create and router
- [x] Display corner swatch on Featured Door Styles section (homepage)
- [x] Show corner swatch in the designer's style picker (ColorSlotButton) as a detail overlay on each style card
- [ ] Use corner swatch as texture fill in the 2D designer elevation rendering for door panels
- [ ] Save checkpoint

## Cabinet Groups Activate/Deactivate

- [ ] Check if cabinet_groups table has an isActive/isEnabled column
- [ ] Add isActive column to cabinet_groups schema if missing (migration + SQL)
- [ ] Add adminToggleCabinetGroup procedure to router
- [ ] Add activate/deactivate toggle buttons to cabinet groups admin UI
- [ ] Filter inactive cabinet groups from public catalog and designer
- [ ] Save checkpoint

## Bug: Duplicate SKU rows in distributor_skus table
- [x] Delete duplicate distributor_skus rows (keep highest ID per distributorId+cabinetId+styleId)
- [x] Add UNIQUE constraint on (distributorId, cabinetId, styleId) to prevent future re-import duplicates
- [x] Update schema.ts to reflect the new unique constraint
- [x] Verify clean counts after deduplication
- [x] Save checkpoint

## Feature: Add Corner Swatch upload field to Edit Door Style dialog
- [x] Add cornerSwatchImageUrl ImageField to the EditDialog in FeaturedStylesAdmin.tsx
- [x] Wire it into the handleSave mutation call
- [x] Save checkpoint

## Feature: Cabinet Layout Spec (drawer/door arrangement order)
- [ ] Add layoutSpec column (text/JSON) to cabinets table in schema.ts
- [ ] Generate and apply migration SQL
- [ ] Update elevation renderer to read layoutSpec sections top-to-bottom
- [ ] Auto-detect layout from description/subCategory when layoutSpec is null
- [ ] Add layoutSpec field to CabinetConfigAdmin edit dialog
- [ ] Save checkpoint

## Layout Spec Builder: per-section drawer/door/shelf with count-across and height

- [x] Add `layoutSpec` column to PlacedCabinet type in design.ts
- [x] Add `layoutSpec` to the LayoutSpec/LayoutSection types in CabinetConfigAdmin
- [x] Build LayoutSpecBuilder UI component with base-type selector, reorderable sections (type/count/height), visual preview bar
- [x] Auto-initialize spec from existing cabinet config (top drawer always 6", doors fill remaining height)
- [x] Wire layoutSpec through adminUpdateCabinet backend (zod schema + patch builder)
- [x] Add layoutSpec to adminListCabinetConfig select projection
- [x] Add layoutSpec to placeableCabinets select projection in design router
- [x] Pass layoutSpec through all addCabinet placements in DesignTool
- [x] Add layoutSpec rendering branch in DoorFront (ElevationView) — renders sections top-to-bottom using flex-col, each row with count-across door/drawer/shelf panels
- [x] TypeScript check passes (0 errors)
- [x] Save checkpoint

## Door Styles Admin: distributor name + catalog preview modal

- [x] Show distributor name on each door style card/row in the admin door styles list
- [x] Add clickable item-count badge on each door style that opens a quick catalog preview modal
- [x] Catalog preview modal shows all SKUs for that style with: master code, description, width×height, cost price, retail price
- [x] Backend: add a `styleSkuPreview` query returning paginated SKUs for a given styleId with cost + retail prices
- [x] TypeScript check passes
- [x] Save checkpoint

## Data import: US Cabinet Depot Capital spec book list prices + alias mapping
- [ ] Extract all cabinet item codes, sizes, and style-column list prices from Capital_Spec_Book_Single_Pages_V8_DIGITAL_ONLY_2.pdf
- [ ] Confirm U.S. Cabinet Depot / Capital collection style codes present in the spec book (SW, SA, SD, SG, SI, SN, SB, SH, SC, SU, etc.)
- [ ] Map Capital distributor item codes to our master alias and sub-alias structure
- [ ] Upsert existing SKU rows with corrected listPrice values from the spec book
- [ ] Insert new SKU rows for items present in the spec book but missing from the database
- [ ] Leave yourCost blank/null for this import where the spec book only provides list price
- [ ] Verify imported counts and spot-check sampled items against the PDF
- [ ] Save checkpoint

## Admin pricing preview terminology fix
- [ ] Update the admin catalog preview so U.S. Cabinet Depot rows label the PDF-provided number as List Price, not Cost
- [ ] Ensure alias-based matching in preview/import uses our master alias and sub alias

## Evidence notes: Capital spec book
- [ ] Save extraction notes from the Capital spec book pages into a local research file before further PDF inspection

## Missing USCD Capital items: insert as unpublished + Pending Review tab

- [ ] Insert 82 missing Capital/USCD cabinet records + distributor_skus (isPublished=0)
- [ ] Rollout shelf cabinets (1RS/2RS/3RS) flagged separately for owner review
- [ ] Add "Pending Review" tab to admin CabinetConfigAdmin showing unpublished SKUs
- [ ] Bulk-publish action on Pending Review tab
- [ ] TypeScript check passes
- [ ] Save checkpoint

## 10×10 Price Shop with Save Snapshots
- [ ] Define standard 10×10 kitchen layout (industry-standard: no trim/crown/lazy susan, 30" walls)
- [ ] Add price_shop_snapshots table to DB schema
- [ ] Backend: priceShop.price10x10 query (homeowner + yourCost per style)
- [ ] Backend: priceShop.saveSnapshot / listSnapshots / deleteSnapshot mutations
- [ ] Frontend: new /price-shop-10x10 page showing both homeowner price and your cost
- [ ] Save snapshot button with name input
- [ ] Saved snapshots list with view/delete actions
- [ ] Wire route in App.tsx
- [ ] TypeScript check passes
- [ ] Save checkpoint

## Save as Bundle Deal (Design Tool)
- [ ] Add bundle_deals table to DB schema (name, description, snapshot JSON, door style, price, published)
- [ ] Backend: design.saveAsBundleDeal mutation (admin only)
- [ ] Backend: bundleDeals.list / get / delete / publish procedures
- [ ] Frontend: "Save as Bundle Deal" dropdown in Design Tool toolbar (admin only)
- [ ] Bundle Deal name + description input dialog
- [ ] Bundle Deals admin management page (list, publish/unpublish, delete)
- [ ] TypeScript check passes
- [ ] Save checkpoint

## Bundle Deals System
- [ ] Design Tool: Save as Bundle Deal button + dialog (name, description, hero image)
- [ ] Backend: public getBundleDeal(id) procedure for storefront
- [ ] Bundle Deals storefront page: browse published bundles, Load & Customize button
- [ ] Design Tool: accept ?bundleId= param and pre-load the design snapshot
- [ ] Bundle Deals admin management page (list, toggle published, delete, reorder)
- [ ] Register /bundles and /admin/bundles routes in App.tsx
- [ ] Register /price-shop-10x10 route in App.tsx
- [ ] TypeScript check passes
- [ ] Save checkpoint

## Unify cabinet categories (DB single source of truth)
- [x] CabinetDetail.tsx StyleCategoryNav filter pills: replaced hardcoded array with useDynamicCategories() hook
- [x] CabinetConfigAdmin.tsx category dropdown: replaced hardcoded SelectItems with dynamic categoryOptions from trpc.cabinetCategories.list
- [x] CabinetConfigAdmin.tsx sub-category dropdown: replaced hardcoded SelectItems with dynamic subCategoryOptions (filtered by selected category)
- [x] Catalog.tsx CategoryLanding: added "Browse by Cabinet Type" section driven by trpc.cabinetCategories.list with tileFor() image/blurb fallback
- [x] TypeScript check passes
- [x] Save checkpoint

## Bug: DoorDrawerDiagram side-by-side rule not applied for drawers+doors cabinets
- [x] Diagnose why the standard-base branch (drawers+doors) is not rendering doors side-by-side
- [x] Fix the routing/branching logic so 2 drawers + 2 doors shows Left Door / Right Door side-by-side
- [x] TypeScript check passes
- [ ] Save checkpoint

## Feature: Doors side-by-side dropdown in cabinet config admin
- [x] Add doorsPerRow (int, nullable) column to cabinet_configs table in DB schema
- [x] Apply migration SQL via webdev_execute_sql
- [x] Add doorsPerRow to CabinetLike type in cabinetGraphics.ts
- [x] Add "Doors side-by-side" dropdown (1, 2, 3, 4) in CabinetConfigAdmin next to the door count field
- [x] Wire doorsPerRow into DoorDrawerDiagram: use it as the cols value for door zone rendering
- [x] Wire doorsPerRow into ElevationView/DoorFront: use it as the side-by-side door count
- [x] Layout Preview reflects the selected doorsPerRow immediately
- [x] TypeScript check passes
- [x] Save checkpoint

## Feature: Add Doors Per Row to inline admin quick-edit on CabinetDetail page
- [x] Find the inline admin edit form/panel in CabinetDetail.tsx
- [x] Add doorsPerRow dropdown to the inline edit form (same options as admin panel)
- [x] Ensure doorsPerRow is included in the catalog query that feeds CabinetDetail
- [x] Wire save mutation to persist doorsPerRow from inline edit
- [x] TypeScript check passes
- [x] Save checkpoint

## Feature: Default door/drawer images in elevation view (no style selected)
- [x] Upload the user's white shaker door image as the default door fallback
- [x] Upload the user's white shaker drawer front image as the default drawer fallback
- [x] Set DEFAULT_DOOR_SAMPLE_URL and DEFAULT_DRAWER_SAMPLE_URL constants in DesignTool
- [x] Wire fallback URLs into doorSampleForCab and drawerSampleForCab so they return the default when no style is selected
- [x] TypeScript check passes
- [x] Save checkpoint

## Bug: Elevation view door frame rounded corners and photo placement
- [x] Remove borderRadius from RecessedPanel so shaker frames have sharp 90° corners
- [x] Remove borderRadius from SingleDoorPanel slab/beaded/inset cases
- [x] Ensure door photo fills only the recessed panel inset area, not the outer rail/stile
- [x] Outer rail/stile frame (stile/rail) shows the painted finish color (face color)
- [x] TypeScript check passes
- [x] Save checkpoint

## Bug: "Upload New" button not working in Replace Cabinet Image dialog
- [ ] Find the Upload New button handler in the image replace dialog component
- [ ] Fix the file input trigger / upload flow so clicking Upload New opens file picker and uploads
- [ ] TypeScript check passes

## Feature: All CabinetConfigAdmin fields on CabinetDetail inline edit panel
- [ ] Audit all fields in CabinetConfigAdmin EditModal vs CabinetDetail inline edit form
- [ ] Add all missing fields to CabinetDetail inline edit panel (numberOfDoors, numberOfDrawers, hasSink, hasGlass, isDecorative, specNotes, layoutSpec, etc.)
- [ ] Ensure all fields are pre-filled from cabinet data and saved correctly
- [ ] TypeScript check passes
- [ ] Save checkpoint

## Bug fix + feature: MediaPicker upload + CabinetDetail inline edit parity (Jul 2026)
- [x] Fix MediaPicker upload buttons (Upload New + Upload & Select) — both now trigger file picker correctly
- [x] Export LayoutSpecBuilder and defaultLayoutSpec from CabinetConfigAdmin for reuse
- [x] Add isBlindCornerCode helper to CabinetDetail
- [x] Add state + pre-fill for: grainDirection, isDecorativeDoor, minPull, maxPull, openingWidth, shelfRadius, shelfCount, cabinetSquare, faceWidth, legWidth, layoutSpec, specImageUrl, specNotes
- [x] Add UI controls in inline edit dialog: Grain Direction select, Decorative Door checkbox, Blind Corner Pull Spec (BBC/WBC auto-shown), Lazy Susan / Diagonal / Pie-Cut corner measurement blocks, LayoutSpecBuilder, Spec Book Drawing (MediaPicker), Spec Notes textarea
- [x] Wire all new fields into handleSaveEdit (adminUpdateCabinet mutation)
- [x] Replace old manual image upload in catalog image section with MediaPicker
- [x] TypeScript check: 0 errors
- [x] Save checkpoint

## Feature: Triangle Corner Cabinet (WTC/BTC)
- [x] Add `triangle-corner` to `CabinetDrawingType` union in `cabinetGraphics.ts`
- [x] Add `cornerType` field to `CabinetLike` interface in `cabinetGraphics.ts`
- [x] Add `triangle-corner` detection in `cabinetDrawingType()` function (checks `cornerType === "triangle"` or WTC/BTC code prefix)
- [x] Add `"triangle-corner"` entry to `detailMap` in `cabinetGraphics.ts` (fixes TS2741 error)
- [x] Add `triangleCornerClipPath()` and `isTriangleCorner()` functions to `design.ts`
- [x] Add `cornerType` to `PlacedCabinet` and `DesignCabinet` interfaces in `design.ts`
- [x] Apply `triangleCornerClipPath` in `PlanCanvas.tsx` for right-triangle plan footprint
- [x] Add `triangle-corner` elevation rendering block in `ElevationView.tsx` (single door on angled face with corner shadow indicators)
- [x] Add "Triangle Corner (WTC / BTC)" option to `CabinetConfigAdmin` dropdown
- [x] Add `triangle` to `cornerType` zod enum in `catalog.ts` server router
- [x] Add `cornerType` to `placeableCabinets` server select query in `design.ts` router
- [x] TypeScript: 0 errors

## Feature: Pricing Tier Auto-Set (Jul 2026)
- [x] Add `useEffect` in `DesignTool.tsx` to auto-set `tier` from `user.pricingTier` on login
- [x] Change initial tier default from `"Contractor"` to `"Homeowner"` for guests
- [x] Wrap both tier dropdowns in `{isAdmin && ...}` so only admins see the tier switcher
- [x] Fix `orderTier` function in `orders.ts` to handle `"Homeowner"` tier
- [x] Add server-side tier enforcement in `createRequest` mutation (non-admins get their DB tier)
- [x] Add `"Homeowner"` to `orderRequests.tier` enum in `drizzle/schema.ts`
- [x] Generate migration `drizzle/0099_purple_bullseye.sql` (ALTER TABLE to add Homeowner to enum)
- [x] Apply migration via `webdev_execute_sql`
- [x] Update `OrderLineItem.tier` type to include `"Homeowner"`
- [x] Fix `createRequest` to use `resolvedTier` (not `input.tier`) when inserting order
- [x] TypeScript: 0 errors
- [x] Save checkpoint

## Feature: facePattern for specialty open-face cabinets (Jul 2026)
- [x] Add `facePattern` nullable enum column to `cabinet_configs` table in `drizzle/schema.ts` (values: 'slats', 'criss-cross', 'lattice', 'open')
- [x] Generate migration with `pnpm drizzle-kit generate` and apply via `webdev_execute_sql`
- [x] Add `facePattern` to `CabinetLike` interface in `cabinetGraphics.ts`
- [x] Add code-prefix auto-detection fallback in `cabinetDrawingType()` (WR/WPR/PR → slats by default)
- [x] Add `facePattern` dropdown to `CabinetConfigAdmin` admin UI (None / Vertical Slats / Criss-Cross / Lattice / Open)
- [x] Add `facePattern` dropdown to `CabinetDetail` inline edit panel
- [x] Add `facePattern` to server catalog router (adminUpdateCabinet + placeableCabinets query)
- [x] Add `facePattern` to design router `placeableCabinets` select
- [x] Add `facePattern` to `PlacedCabinet` interface in `design.ts`
- [x] Implement `FacePattern` SVG component in `ElevationView.tsx` rendering all 4 patterns
- [x] Wire `FacePattern` into `DoorFront` — replaces door panel when `facePattern` is set
- [x] TypeScript: 0 errors
- [x] Save checkpoint

## Feature: Edit masterCode in cabinet admin dialog with alias preservation (Jul 2026)
- [x] Create cabinet_aliases table (cabinetId FK, alias text, createdAt) in drizzle/schema.ts
- [x] Generate migration and apply via webdev_execute_sql
- [x] Add editMasterCode useState to CabinetDetail.tsx
- [x] Initialize editMasterCode from cabinet.masterCode in useEffect
- [x] Add masterCode text input field to the admin edit dialog UI (with note about alias)
- [x] Add masterCode to adminUpdateCabinet zod schema in catalog.ts
- [x] In adminUpdateCabinet handler: if masterCode changed, insert old code into cabinet_aliases before updating
- [x] TypeScript: 0 errors
- [x] Save checkpoint

## Feature: Admin "Edit Config" link in designer cabinet detail panel (Jul 2026)
- [x] Find the cabinet detail panel header in DesignTool (the "Selected WDC2442" sheet)
- [x] Add admin-only "Edit Config ↗" link next to the master code that opens /catalog/{masterCode} in a new tab
- [x] TypeScript: 0 errors
- [x] Save checkpoint

## Bug: No catalog images in shopping cart (Jul 2026)
- [x] Find cart item component and trace image rendering
- [x] Fix cart to display catalogImageUrl instead of SVG line-drawing placeholder
- [x] TypeScript: 0 errors
- [x] Save checkpoint

## Feature: Glass-door stacker cabinets in designer (PG/GD codes) (Jul 2026)
- [ ] Add isGlassStacker(masterCode) helper in design.ts (starts or ends with PG or GD, case-insensitive)
- [ ] Add 'stacker' placementType to DB enum and apply migration
- [ ] Auto-set placementType='stacker' for PG/GD codes in catalog import/admin
- [ ] Show stacker cabinets in designer wall palette under a "Stackers" section
- [ ] Placement rule: stacker snaps to top of an existing wall cabinet (same width preferred)
- [ ] Elevation rendering: stacker renders above the wall cabinet it sits on
- [ ] Plan view: stacker shares footprint with the wall cabinet below (same depth/width)
- [ ] TypeScript: 0 errors
- [ ] Save checkpoint

## Feature: Glass Door Add-on SKU in cabinet config + designer (Jul 2026)
- [x] Add glassDoorAddonCode varchar column to cabinets table in drizzle/schema.ts
- [x] Generate migration and apply via webdev_execute_sql
- [x] Add glassDoorAddonCode to adminUpdateCabinet zod schema and patch handler in catalog.ts
- [x] Add glassDoorAddonCode to placeableCabinets select in catalog.ts and design.ts routers
- [x] Add glassDoorAddonCode text input to CabinetDetail admin edit dialog
- [x] Add glassDoorAddonCode to PlacedCabinet interface in design.ts
- [x] Pass glassDoorAddonCode through all PlacedCabinet creation sites in DesignTool.tsx
- [x] Add "Add Glass Door" button in designer cabinet detail panel (visible only when glassDoorAddonCode is set)
- [x] On click: add glassDoorAddonCode SKU to cart + set glassDoor=true on placed cabinet
- [x] Extend isStacker() to recognize W*PG suffix codes (12" tall glass stackers)
- [x] TypeScript: 0 errors
- [x] Save checkpoint


## Feature: 20/20 Catalog Importer (Jul 2026)
- [x] Create `catalog_imports` table to track upload history and import status
- [x] Build admin upload UI for 20/20 zip files with file validation and preview
  - [x] Admin page component at /admin/catalog-import
  - [x] File upload form with .zip validation
  - [x] Distributor ID input
  - [x] Pricing preservation toggle
  - [x] Real-time import progress display
  - [x] Import history table with status badges
  - [x] Error handling and user feedback
  - [x] Admin-only access check
- [x] Implement 20/20 XML parser to extract products, options, features, pricing from paf.xml
  - [x] parsePafXml() function parses PAF XML deterministically (no AI)
  - [x] mapCategory() and mapPlacementType() helpers for data mapping
  - [x] 16 unit tests covering XML parsing, category mapping, edge cases
  - [x] All tests passing
- [x] Build auto-import logic: create/update cabinets, map options, download images
  - [x] importPafProducts() processes parsed products deterministically
  - [x] createOrUpdateDistributorSku() handles pricing preservation
  - [x] Automatic cabinet creation with master code deduplication
  - [x] 3 unit tests covering batch import and error handling
- [x] Preserve existing pricing: toggle to skip price updates during import
- [x] Add import status tracking, error logging, and rollback capability
  - [x] catalogImportRouter.executeImport() procedure
  - [x] Status transitions: pending → processing → completed | failed
- [x] Test end-to-end with U.S. Cabinet Depot UCDCA26_1.zip
  - [x] 5 integration tests with realistic PAF XML (U.S. Cabinet Depot style)
  - [x] Tests cover base, wall, tall, island, vanity, and accessory cabinets
  - [x] Category mapping tests for all cabinet types
  - [x] Placement type mapping tests
  - [x] Product code format handling (dashes, underscores)
  - [x] Pricing preservation across all products
  - [x] All 24 tests passing
- [x] TypeScript: 0 errors
- [x] Save checkpoint

- [x] Fix catalog importer: resolve product images via alias SKU lookup, update catalogImageUrl

## Feature: Fix Catalog Importer - Extract Dimensions & Product Types

- [x] Add productType and cabinetStyle fields to cabinets table
  - [x] productType: "standard" | "openShelf" | "corner" | "endCap" | "specialty" | "accessory"
  - [x] cabinetStyle: "closedDoors" | "openShelf" | "glass" | "etc"
- [x] Update PAF XML parser to extract actual dimensions (width, depth, height)
- [x] Update PAF XML parser to detect product types from product code/description
- [x] Update importer logic to use actual dimensions instead of defaults
- [x] Detect and tag open shelf (BES*), corner (BEC*), and specialty items
- [x] Update 2D designer rendering to handle specialty item placement (baseTop, underCabinet)
  - [x] Knee drawers positioned at 24.5" height on top of base cabinets
  - [x] Stem glass holders positioned under wall cabinets
  - [x] Open shelf end caps marked as endCap placement type
- [x] Test with Ashford BES12, BEC24, SGH30 to verify correct rendering
- [x] Save checkpoint


## Feature: Cabinet Merge UI in Config Admin (Aug 2026)
- [x] Add mergeCabinets tRPC procedure to cabinets router (takes masterCabinetId, aliasId, returns success)
- [x] Add checkboxes to CabinetConfigAdmin table for row selection
- [x] Add "Merge" button that appears when exactly 2 items are selected
- [x] Create MergeDialog component with master/alias designation
- [x] Wire merge button to open dialog and execute merge
- [x] Simplify merge dialog to show only cabinet codes (mobile-friendly)
- [x] Auto-open edit screen after merge completes so user can fix config
- [x] Test merge workflow on mobile
- [x] Save checkpoint
- [ ] Remove duplicate GenericCabinetsAdmin list (DONE - now shows single 589 cabinet list)
- [x] Add distributor information to cabinet edit dialog
- [x] Fix: Show ONLY distributors that have THIS CABINET active (with published SKUs)
- [x] Fix: Distributor list in edit dialog not updating after saving changes
- [x] Show ALL 880 cabinets in backend admin (remove isActive filter)
- [ ] Fix merge procedure - still showing "No procedure found" error
- [ ] Test merge works on phone
- [ ] Test merge works on PC/desktop
- [ ] Verify distributors shown are ONLY those with published+available SKUs (not guesses)

## Schema: Room-layout to SKU catalog mapping
- [x] Add matching Drizzle ORM table definitions and logical relations
- [x] Add optional kitchen-design layout metadata fields
- [x] Run focused unit coverage and typecheck without generating or applying a migration

## Seed: Room-layout presets from real catalog SKUs
- [x] Profile existing active and published catalog coverage for starter-layout zones
- [x] Write an idempotent seed script that uses real distributor SKU records
- [x] Validate the script without inserting data

## Feature: Catalog-aware room layout starter
- [x] Generate, review, and apply the additive room-layout migration
- [x] Run guarded seed using real catalog SKUs and verify the seeded records
- [x] Add typed room-layout preset and eligible-catalog API procedures
- [x] Build responsive room shape and layout selector UI from seeded data
- [x] Test API, seeded data, and UI on desktop and mobile

## Assessment: Cabinets.com-inspired 3D room rendering
- [x] Inspect the Cabinets.com Blank Slate onboarding and construction selection; later public stages did not advance reliably under automation
- [x] Compare the intended 3D experience with current Cabinet Dealz room geometry, catalog data, elevation rendering, and existing isometric preview
- [x] Define a catalog-aware 3D scene implementation and validation plan
- [x] Implement interactive 3D room preview with actual eligible distributor SKUs

## Feature: Interactive catalog-aware 3D room preview
- [x] Add typed API endpoint for room configuration, layout zones, real eligible SKUs, and finish materials
- [x] Build interactive Three.js/WebGL renderer for room shell, cabinet boxes, countertops, and finish materials
- [x] Add camera controls and responsive desktop/mobile 3D preview UI
- [x] Connect the 3D preview to seeded room layouts and the current designer state
- [x] Validate real catalog data and scene renderer helpers with focused tests, API smoke checks, and guarded designer-route verification

## Fix: Open 3D preview for existing designs
- [x] Remove the unnecessary seeded-layout requirement from the 3D preview button
- [x] Render placed cabinets and the current room geometry in the interactive 3D scene
- [x] Verify desktop and mobile 3D preview access

## Feature: Enhanced interactive 3D presentation
- [x] Add presentation material controls for cabinet finishes and countertops
- [x] Improve scene lighting, shadows, and camera orbit/zoom/pan behavior
- [x] Add high-resolution 3D scene download
- [x] Test responsive 3D controls and image export

## Feature: 3D pricing, transitions, and sharing
- [x] Add truthful live order-pricing and presentation-configuration summary
- [x] Add finish-change loading and transition feedback
- [x] Add shareable 3D configuration link generation and restoration
- [x] Test pricing clarity, material transitions, and share-link behavior

## Feature: Rich editable 3D room workflow
- [x] Add an itemized pricing breakdown drawer with actual catalog line pricing
- [x] Save and restore current 3D room configuration through the signed-in account
- [x] Add a real-catalog accessories and appliances placement panel for the 3D scene
- [x] Render Shaker, raised-panel, and flat-panel door geometry in the 3D view
- [x] Validate pricing, saving, placement, and detailed cabinet rendering on desktop and mobile

## Feature: Quote export, 3D cabinet inspection, and refrigerator panels
- [x] Add PDF export with the current 3D rendering and actual itemized quote lines
- [x] Add cabinet hover/click inspection for individual real catalog price and style details in 3D
- [x] Force both refrigerator end panels to start at the floor and separate adjacent cabinets from the refrigerator
- [x] Validate desktop/mobile export, inspection, and refrigerator panel layout

## Enhancement: 2D plan included in 3D quote PDF
- [x] Generate a top-down current-layout floor-plan image for PDF export
- [x] Add the 2D floor plan alongside the 3D rendering and itemized quote
- [x] Validate the combined PDF export layout

## Enhancement: Email and print 3D quote workflow
- [x] Include selected cabinet finish and countertop details in the generated quote
- [x] Add a direct print action for the current quote and floor plan
- [x] Add signed-in account email delivery for the quote PDF
- [x] Validate quote details, print output, and email-send safeguards

## Fix: Refrigerator surround and sink-base elevation construction rules
- [x] Force both refrigerator end panels to visibly run floor-to-top in elevation
- [x] Stop countertops at the outside face of refrigerator end panels
- [x] Render sink-base drawers and doors at standard base-cabinet proportions
- [x] Test refrigerator and sink-base elevation rules

## Fix: 3D workspace size and active catalog finish
- [x] Expand the 3D preview dialog into a responsive wide workspace
- [x] Make the active catalog door-style color the default 3D cabinet finish
- [x] Validate 3D dialog and catalog-finish behavior on desktop and mobile

## Enhancement: Distraction-free 3D full-screen view
- [x] Add full-screen entry and exit controls to the interactive 3D preview
- [x] Synchronize the control state with browser full-screen changes
- [x] Validate the full-screen 3D workspace on desktop and mobile

## Investigation: Reaves Way storefront branding and routing
- [ ] Identify the domain or route that selected the Reaves Way storefront
- [ ] Confirm whether Reaves Way branding is intended for that address
- [ ] Correct routing only if the displayed brand does not match the intended storefront

## Inspection: Invoice page
- [x] Locate and open the current invoice page
- [x] Verify the invoice page content and report any issue

## Feature: Catalog-aware room-layout website from uploaded blueprint
- [x] Verify existing room preset, zone, and resolved-SKU data contracts
- [x] Build a clear website entry experience for room shape and layout selection
- [x] Connect room-layout choices to active, published, available distributor SKUs
- [x] Preserve existing manual design and account-save behavior
- [x] Test the room-layout website flow on desktop and mobile

## Verification: 3D PDF quote and account-email finish details
- [x] Inspect the generated PDF content and email attachment handoff
- [x] Add regression coverage for cabinet-finish and countertop detail inclusion
- [x] Report verified quote and email-detail behavior

## Fix: Active 2D room shape and 3D image download
- [x] Make 3D floor geometry match the current rectangular, L-shaped, or custom 2D room
- [x] Expose a prominent high-resolution image-download action inside the 3D popup
- [x] Test rectangle, L-shape, and image-download behavior on desktop and mobile

## Fix: Prevent overlapping design items
- [x] Add shared collision detection across cabinets, appliances, panels, and accessories
- [x] Prevent collisions during new-item placement, drag moves, and automated surround placement
- [x] Preserve edge-to-edge adjacency while rejecting true overlap
- [x] Add regression tests for 3DB15/B33 and appliance-panel collision cases

## Enhancement: Visible image download and overlap feedback
- [x] Make the 3D image-download action prominent and easy to identify
- [x] Show a persistent visual overlap warning in the designer after a rejected placement
- [x] Verify download action and warning behavior on desktop and mobile

## Fix: Refrigerator/base overlap across all placement paths
- [ ] Trace and close placement paths that allow a base cabinet to overlap a refrigerator
- [ ] Centralize collision resolution before cabinet state updates are committed
- [ ] Protect refrigerator surround, saved-design restore, and explicit-position placement flows
- [ ] Add refrigerator/base overlap and adjacent-run regression coverage
