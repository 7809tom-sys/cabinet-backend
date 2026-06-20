# Cabinet Dealz — Project TODO

## Phase 1: Database & Data Foundation
- [x] Design and apply full database schema (cabinets, styles, distributors, pricing, users, orders)
- [x] Seed all 393 cabinet items from master spreadsheet
- [x] Seed 61 door styles from CD_STANDARDS
- [x] Seed distributor records (US Cabinet Depot, Clark & Son, Skyline)
- [x] Seed 10,643 distributor SKUs with pricing tiers (Wholesale, Contractor, Homeowner)
- [ ] Seed blind corner cabinet measurements
- [ ] Upload all cabinet 2D graphics and door sample images to CDN

## Phase 2: Homepage & Navigation
- [x] Global top navigation with logo, links, and auth
- [x] Hero section with three audience CTAs (Distributors, Dealers, Homeowners)
- [x] Platform overview section
- [x] Feature highlights section
- [x] Footer with links

## Phase 3: Product Catalog
- [x] Category browser (Base, Wall, Tall, ADA, Vanity, Accessory)
- [x] Sub-category filtering
- [x] Cabinet grid with search and filters
- [x] Cabinet detail page with specs, dimensions, 2D graphic
- [ ] Blind corner detail page with opening width, min pull, max pull

## Phase 4: Door Style Selector & Price Switcher
- [x] Door style selector grid with door sample images and color name labels
- [ ] Room scene photo viewer per style
- [x] One-click style switcher that updates cabinet detail view
- [x] One-click distributor switcher (US Cabinet Depot, Clark & Son, Skyline)
- [x] Pricing display at three tiers: Wholesale, Contractor, Homeowner
- [x] Adjusted List Price calculation and display

## Phase 5: 2D Kitchen Design Tool
- [x] Bird's-eye canvas room builder with foot rulers and room presets
- [x] Cabinet placement from palette onto canvas (Base / Wall / Tall tabs)
- [x] Wall-magnet snapping (flush to walls + edge-to-edge alignment)
- [x] Correct heights (base on floor, wall cabinets at standard mounting height)
- [x] One-click Front Elevation view (Bird's-Eye / Front / Split toggle)
- [x] Live pricing BOM with distributor + style + tier selectors and running total
- [x] Email gate for non-logged-in users
- [ ] Style application visual (door graphics) on placed cabinets
- [ ] Save/load kitchen design
- [ ] Export design to cart

## Data Quality Cleanup
- [x] Normalize 215 cabinet descriptions to uniform US Cabinet Depot style
- [x] Fix door/drawer counts derived from description text
- [x] Rebuild orphaned distributor_skus cabinetId/styleId links (10,643 SKUs, 0 orphans)
- [x] Dedupe duplicate door styles (122 -> 61)
- [x] Fix 12 mismatched cabinet specs (BFH full-height, widths, panels tagged as accessory)

## Phase 6: OCR Photo-to-Cart & Bulk Ordering
- [ ] Photo upload UI for floor plan images
- [ ] OCR processing via LLM vision to extract cabinet codes
- [ ] Code-to-Master-ID matching and cart population
- [ ] CSV upload bulk ordering
- [ ] Barcode scan ordering interface
- [ ] Order review and confirmation

## Phase 7: Portals & Admin
- [ ] Distributor portal: product visibility toggle (private vs. published)
- [ ] Distributor portal: catalog management and order view
- [ ] Dealer white-label storefront
- [ ] Admin dashboard: manage distributors, subscribers, pricing multipliers
- [ ] Admin dashboard: catalog updates and conflict resolution

## Phase 8: Polish & Delivery
- [ ] Responsive design (mobile/tablet/desktop)
- [ ] Loading states, empty states, error handling
- [ ] Vitest unit tests
- [ ] Final checkpoint and delivery


## White-Label & Trade-Only Conversion
- [x] Map distributor IDs to neutral labels (Line A / Line B / Line C) at the DB source
- [ ] Remove distributor brand names from Home.tsx (hero copy, featured styles, distributor strip, footer)
- [ ] Remove distributor brand names from Door Styles, Catalog, Cabinet Detail, Design Tool
- [ ] Remove Homeowner pricing tier (keep Wholesale + Contractor trade tiers)
- [ ] Remove consumer buy path: "Sign In to Order", "Add to Cart", cart icon, homeowner audience card/CTA
- [ ] Update homepage messaging to trade/wholesale audience (no homeowner selling)
- [ ] Verify no brand names or consumer-selling elements remain in UI

## Per-Distributor White-Label Model (revised direction)
- [x] Home page white-labeled + Cabinet Dealz self-branding (hero, audience, supply strip, footer)
- [ ] Add `whiteLabel` boolean column to distributors table (default true = hidden)
- [ ] API returns real brand name only when whiteLabel = false, else neutral label
- [ ] All three current distributors set to white-labeled (hidden)
- [ ] Door Styles / Catalog / Cabinet Detail / Design Tool respect whiteLabel flag
- [ ] Cabinet Dealz brand strong across all customer-facing pages
- [ ] Product image watermarks never show distributor/dealer names
- [ ] Keep trade ordering path (buy/design); homeowner retail moves to future affiliate site


## Homeowner Pricing — Competitive Comparison (future affiliate site)
- [ ] When recommending a homeowner sell price, compare against rtastore.com on random cabinets
- [ ] Build a price-comparison reference (our homeowner price vs RTA Store) to validate positioning


## Kitchen Floor-Plan Bundles ("Kitchen Packages")
- [x] Research competitor 10×10 package builds (they spec cheapest blind-corner budget RTA configs)
- [x] Define standard bundle layouts: L-Shape 10×10, U-Shape 10×12, Galley/One-Wall 10×10
- [x] Compute bundle BOMs + landed cost (lowest line + $30/cab assembly + ~8% regional freight)
- [x] Build bundle vs competitor comparison spreadsheet (assembled benchmark, suggested affiliate retail ~3% under avg)
- [x] Add kitchen_packages data (shared/packages.ts: BOM + placed-cabinet layout)
- [x] tRPC packages router: list, bySlug (priced BOM), layout (for design tool)
- [x] Kitchen Packages browse page (cards: layout, cabinet count, our price vs competitor avg, savings badge)
- [x] Package detail page: BOM table, pricing, comparison, affiliate economics, "Customize in Design Tool" button
- [x] Load a package layout straight into the 2D design tool canvas (?package=slug)
- [x] Reframe messaging: packages available assembled OR flat-pack (RTA), per partner feedback
- [x] Vitest spec for packages router (pricing math + BOM completeness + layout resolution)
- [x] Add error/empty states to packages browse page (failed/empty list with retry)
- [x] Distinguish network-error vs not-found on package detail page (retry + back)
- [x] Package preload error/invalid-slug feedback in Design Tool
- [x] Finish white-label wiring through catalog/design routers + pages (verified no real supplier names leak; network shown as Line A/B/C)
- [x] Verify in browser + save checkpoint (desktop + mobile + design-tool handoff)


## Design Tool fixes & features (user request)

- [x] Fix: cannot delete a cabinet when off-category (on-cabinet X + toolbar Delete + keyboard Delete/Backspace work for any selected item)
- [x] Add: tape-measure tool showing distance/gap between two objects on the canvas
- [x] Render corner cabinets (Lazy Susan / blind/diagonal corner) as an L-shape in bird's-eye view instead of a plain square
- [x] Add Appliances category to design tool palette (range, refrigerator, dishwasher, sink, hood, over-range microwave)
- [x] Render appliances in Front View (elevation) as well as bird's-eye
- [x] Verify Front View (elevation) toggle works and is discoverable
- [x] Add an Island Zone: toggleable dashed rectangle in the room marking where island cabinets go; movable + resizable
- [x] Add Doors & Windows as adjustable wall openings: 6 presets, drag-along-wall (verified live: -130px drag moved element -130px, stays clamped), width-resize handle (min 12"), render in plan + elevation, deletable + keyboard delete
- [ ] BUG (published site): Sign In returns {"error":"oauth callback failed"} at /api/oauth/callback on cabinetdeals-fg7png.manus.space — investigate OAuth callback / redirect URI on the live deployment
- [x] Auto-apply trim/door style to the design: selecting a door style re-skins placed cabinets on canvas + elevation via finish color map (26 unit tests pass)
- [x] Add Crown Molding: toggle draws crown along top of wall cabinets (elevation) + linear-foot BOM line
- [x] Add Toe Kick: recessed base strip under base cabinets (elevation) + BOM line
- [x] Blind corner cabinets (BBC base / WBC wall) must auto-include a corner FILLER: BOM filler line (base/wall) via blindCornerFillers + hatched filler-gap marker in plan view (tests pass)
- [ ] Audit site imagery: images reported "way off" — check broken/placeholder images, wrong aspect ratios/proportions across Home, Catalog, Door Styles, Packages; ensure watermarks never show distributor/dealer names

## Design Tool wall + measurements (user request)
- [x] Editable custom room dimensions: type width & depth (feet + inches), redraws to scale
- [x] Mouse-draw room mode: drag on an empty canvas to draw the room outline as an alternative to typing
- [x] Wall-selection control: when a cabinet is selected, click Top/Bottom/Left/Right to snap it to that wall
- [x] Add `snapToWall()` helper in design.ts + vitest coverage

## Design Tool active-wall placement (user request: highlight wall, add item to it)
- [x] Add `activeWall` state (top/bottom/left/right) in DesignTool
- [x] Persistent wall selector in toolbar; highlights chosen wall
- [x] Highlight the active wall on the PlanCanvas (colored band)
- [x] New cabinets/appliances march along the active wall (nextFreeSpotOnWall)
- [x] New openings (door/window) default to the active wall
- [x] Per-cabinet wall move (WallPicker) still works
- [x] Clamp layout (cabinets/openings/island) in-bounds on room resize
- [x] Clean room dimension display (feet+inches, not raw decimal)
- [x] Tests for nextFreeSpotOnWall + clampLayoutToRoom
- [x] Typecheck + vitest pass; browser verify across all 4 walls


## Design Tool: drag-a-wall to resize room (user clarification)
- [x] Click a wall on the canvas to highlight/select it (activeWall state)
- [x] Drag the highlighted wall in/out to grow or shrink the room on that side
- [x] Live feet/inches readout while dragging the wall
- [x] Resizing clamps existing cabinets/openings/island in-bounds
- [x] Adding an item with a wall highlighted drops it onto that wall
- [x] resizeRoomByWall() helper in design.ts + tests
- [x] Browser verify dragging each of the 4 walls (wall bands render + highlight; resize math unit-tested)


## Design Tool: only offer available cabinets (user request)
- [x] placeableCabinets only returns cabinets with a published+available distributor SKU
- [x] When a distributor+style is selected, palette is filtered to that combination's available SKUs
- [x] Empty-state copy when no cabinets are available for the current filter
- [x] Tests for the available-only filter logic
- [x] Typecheck + vitest pass; browser verify palette filtering


## Design Tool: helpful on-page hints (user request)
- [x] Tip bar near the toolbar with a short rotating "how to" hint
- [x] Help (?) button opens a guide dialog covering: pick a wall, add items to the active wall, drag a wall to resize, draw the room, type exact measurements, snap a placed cabinet to a wall
- [x] Dismissable hint that remembers via localStorage
- [x] Browser verify hints render


## Design Tool: sensible trim rounding (user request)
- [x] Trim ordered in standard stick lengths (96") with cut/waste allowance, rounded up to whole sticks
- [x] trimPiecesNeeded() helper + keep linear feet for reference
- [x] BOM shows sticks to order (e.g., "2 pcs @ 8 ft = 16 ft") for crown + toe kick
- [x] Tests for trim rounding
- [x] Typecheck + vitest pass; browser verify


## Design Tool: trim rounding finish (user request)
- [x] Crown adds +3" miter allowance per wall run (12" wall -> 15" cut); applies to any mitered trim
- [x] miteredTrimInches + cabinetWall helpers; toe kick stays continuous (no miter allowance)
- [x] Pass room into crownLinearInches at the call site
- [x] Round trim to whole standard sticks (96") with waste; BOM shows pcs + measured run
- [x] Tests for trim rounding + miter allowance (74 design tests pass)

## Design Tool: countertop quote tool (user request)
- [x] Countertop toggle measures base + island runs -> sq ft and linear ft
- [x] countertopArea() helper (25.5" depth incl. overhang) + tests
- [x] BOM shows countertop with sq ft + linear ft and a Quote tag (not auto-priced)
- [x] countertop_quotes DB table (design snapshot, measurements, contractor contact, status)
- [x] tRPC procedure to submit a countertop quote request + owner notification
- [x] "Request Countertop Quote" button in the design tool wired to submit
- [x] Typecheck + vitest pass; browser verify trim + countertop quote flow (83 tests pass)


## Pro Network (installers + countertop fabricators) — platform-wide, shared by ALL affiliate stores
- [x] Fixed earlier: EmailGate setState-during-render moved to useEffect + stable useCallback
- [x] DB: pro_applications table (company, contact, trades[], service ZIPs/radius, materials, lead time, license/insurance, status pending/approved/rejected)
- [x] Migration generated + applied
- [x] tRPC: pros.submitApplication (public signup) with validation (apply is reserved)
- [x] tRPC: pros.adminList / pros.adminSetStatus (admin-gated approve/reject)
- [x] tRPC: pros.matchByArea (find approved pros covering a ZIP, by trade)
- [x] Owner notification on new pro application
- [x] Public "Join Our Pro Network" signup page + nav/footer entry
- [x] Admin review UI (approve/reject) in admin area (new Admin page, tabs for pros + quotes)
- [x] Admin queries have explicit error+retry states (not misleading empty states)
- [x] Route countertop quote requests to matching approved pros by service area (admin "Find Pros" by ZIP on each quote)
- [x] Track 15% management fee on routed jobs (fee estimate shown on quoted jobs)
- [x] Tests: proCoversZip (explicit ZIP, prefix, trade filter), management fee math
- [x] Typecheck + vitest pass (107 tests green); browser verify signup + admin review


## Cabinet imagery: to-scale 2D drawings per model (user request — ~380 models, image must match model + size)
- [ ] Build CabinetDrawing SVG component: proportions from real width/height (12" narrow vs 30" wide)
- [ ] Front detail by type: standard doors, drawer base (stacked drawers), sink base (false tilt-out top + sink cutout, NOT straight edge), appliance garage (tambour roll-up slats), blind corner (L-shape), vanity, ADA, accessory/molding (thin strip)
- [ ] Derive drawing type from category/subCategory/masterCode + numberOfDoors/numberOfDrawers
- [ ] Replace generic Package icon on Catalog cards with CabinetDrawing
- [ ] Replace generic Package icon on Cabinet Detail with CabinetDrawing
- [ ] Use CabinetDrawing in Design Tool palette/canvas where helpful (consistency)
- [ ] Unit tests for drawing-type selection + proportion (aspect ratio from w/h)
- [ ] Typecheck + vitest pass
- [ ] Browser verify: 12" vs 30" drawer base look different, sink base tilt-out+cutout, appliance garage tambour
- [ ] Checkpoint


## Cabinet imagery: to-scale 2D drawings per model (~380 models; image must match model + size)
- [x] Build CabinetDrawing SVG component: proportions from real width/height (12" narrow vs 30" wide)
- [x] Front detail by type: standard doors, drawer base (stacked drawers), sink base (false tilt-out top + sink cutout, NOT straight edge), appliance garage (tambour roll-up slats), blind corner (L-shape), vanity, ADA, accessory/molding (thin strip)
- [x] Derive drawing type from category/subCategory/masterCode + numberOfDoors/numberOfDrawers
- [x] SEO: descriptive alt text per model (e.g., "Drawer Base 12\" (DB12) — 3-drawer base cabinet")
- [x] SEO: image slug/key from description + masterCode (e.g., drawer-base-12-db12)
- [x] Replace generic Package icon on Catalog cards with CabinetDrawing + alt
- [x] Replace generic Package icon on Cabinet Detail with CabinetDrawing + alt
- [x] Use CabinetDrawing in Design Tool palette items (consistency)
- [x] Unit tests for drawing-type selection + proportion + slug/alt builder
- [x] Typecheck + vitest pass (99 tests green)
- [x] Browser verify: 12" vs 30" drawer base differ, sink base tilt-out+cutout, appliance garage tambour
- [ ] (Optional later) Export PNGs named by slug for Google Images / listings
- [x] Checkpoint (verified FSB-30 sink base false-front + DB-12-3 vs DB-27-3 proportions differ)


## Catalog: category-first layout with room scenes (user request)
- [x] Source kitchen room-scene images (license-free) for category tiles + hero
- [x] Catalog landing: hero room scene + clickable category tiles (Base, Wall, Tall, ADA, Vanity, Accessory)
- [x] Clicking a category drills into that category's to-scale cabinet drawings
- [x] Keep search + back navigation from the drill-in view
- [x] Design Tool keeps quick Base/Wall/Tall tabs (with new to-scale drawings on items)
- [x] Browser verify category-first flow


## User fix: BA-24 naming + no distributor names anywhere (user request)
- [x] Rename BA-24 to "24\" Angle Base Cabinet" (was "24\" Base End Angle Cabinet"; verified via tRPC)
- [x] Verified BA-24 angle base is NOT treated as blind corner (isBlindCorner/isCornerCabinet don't match BA prefix or its description) — no auto-filler
- [x] Full sweep: no real distributor names anywhere user-facing — scrubbed descriptionSource (cabinets) + distributorName (door styles) from public API; only code comment retains the mapping
- [x] Grep DB cabinet/description rows + seed files + client code for brand names (only a server comment referenced them)
- [x] Browser verify BA-24 detail + catalog + design tool show neutral labels only


## Door-style-driven model: NO distributor/line names anywhere (user request)
- [x] Remove "Line A/B/C" neutral labels too — distributors.list no longer consumed by any client page (labels never reach UI)
- [x] Cabinet Detail: door-style-first selection (stylesForCabinet); price follows chosen style; trade-only tiers
- [x] Door Styles page: presents purely by style (dedup by name, filter by Shaker/Raised Panel/Slab); no distributor grouping/counts
- [x] Design Tool pricing: door-style selector only; styleId-based placeableCabinets + priceForCabinets resolve SKU server-side
- [x] Home page: featured styles + supply strip reframed to door-style/quality; pricing widget compares by door style
- [x] Hide "Dist SKU" / "Dist:" lines from user-facing detail
- [x] Keep distributor data internal only (sourcing/fulfillment), never shown to users
- [x] SEO: no SKU/distributor counts shown
- [x] Typecheck (0 errors) + vitest pass (107); leak-check CLEAN on cabinets/doorStyles/pricing
