# Cabinet Dealz — Project TODO

## Phase 1: Database & Data Foundation
- [x] Design and apply full database schema (cabinets, styles, distributors, pricing, users, orders)
- [x] Seed all 393 cabinet items from master spreadsheet
- [x] Seed 61 door styles from CD_STANDARDS
- [x] Seed distributor records (US Cabinet Depot, Clark & Son, Skyline)
- [x] Seed 10,643 distributor SKUs with pricing tiers (Wholesale, Contractor, Homeowner)
- [x] Seed blind corner cabinet measurements (12 cabinets: base openingWidth 15/minPull 3/maxPull 9, wall 12/2/6)
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
- [x] Blind corner detail on Cabinet Detail: "Blind Corner Details" panel renders opening width + min/max pull with pull-out clearance note (verified /catalog/BBC-45). Fixed DoorStyleSwatch to read style.name + French color terms (blanc/noir/gris/creme) so picker swatches render in real colors

## Phase 4: Door Style Selector & Price Switcher
- [x] Door style selector grid with door sample images and color name labels
- [x] Room scene viewer per style: clickable Door Styles card opens a dialog with a generated RoomScenePreview (upper+base cabinet run, backsplash, countertop, toe kick) colored to the style's real finish + panel treatment (no dead photo links)
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
- [x] Style application visual on placed cabinets: ElevationView now draws door-style-specific fronts (shaker/double-shaker/raised/slab/beaded/inset) via shared doorPanelKind helper, driven by the selected style (3 panel-kind tests; 117 total pass)
- [x] Save/load kitchen design: DesignActions (Save names + persists room/cabinets/style via design.save; My Designs lists design.myDesigns with loading/error+retry/signed-out/empty states, restores onto canvas via loadSavedDesign)
- [x] Verified Save (guest/email-gated) end-to-end in browser (placed DB-24-3 -> Save -> "Design saved" toast confirmed). My Designs correctly shows signed-out account-scoped state for guests (by design).
- [ ] Verify My Designs reload while AUTHENTICATED (saved design appears in list -> load restores room/cabinets/style onto canvas) — blocked in sandbox (guest only); load handler + myDesigns query exist in code
- [~] Export design to cart: cart is still a placeholder (no cart backend yet); SHIPPED INSTEAD: "Export Build Sheet (CSV)" itemizing cabinets (qty/size/type/unit+line price) + fillers/crown/toe-kick/countertop + total; pure buildSheetCsv unit-tested
- [ ] (Deferred) Real Export-to-Cart once a cart backend/checkout exists

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
- [x] Audit site imagery: door-style photo fields (/door-samples, /thumbnails, /room-scenes) were all dead links -> replaced with accurate color-correct DoorStyleSwatch SVGs (Door Styles + Cabinet Detail picker/sample). Catalog hero+6 category tiles verified serving real JPEGs (200). No distributor/dealer names on any visual. 7 swatch tests added (114 total pass).
  - [x] Home page audited (full-page screenshot): no photos — typographic hero + icon cards + SVG price widget + text category tiles; no broken/placeholder images, no supplier/dealer names
  - [x] Kitchen Packages audited (full-page screenshot): SVG layout glyphs (L/U/galley), priced cards + badges; no broken images, no supplier names

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


## Owner email notifications (user request: stop the quote/application emails)
- [x] Disable owner email on countertop quote submit (still saved to DB + Admin)
- [x] Disable owner email on Pro Network application submit (still saved to DB + Admin)
- [x] Stop generating QA/test submissions against the live preview
- [x] Typecheck + vitest pass after disabling notifications (124 tests)

## Phase 6: OCR Photo-to-Order & Bulk Ordering (option a: trade order-request/build list, no consumer checkout)
- [x] DB: order_requests table (originator email/user, line items JSON, source: ocr|csv|design|manual, status: draft|submitted|confirmed, totals)
- [x] tRPC: orders.createRequest / orders.myRequests / orders.byId / orders.confirm (originator confirmation) + adminList
- [x] OCR: photo/quote upload -> LLM vision extracts cabinet codes + qty -> match to master cabinet IDs (base64 data URL, no upload roundtrip)
- [x] OCR review UI: show matched lines (editable qty, swap/remove unmatched) before adding to order request
- [x] CSV bulk import: upload code,qty CSV -> parse + match -> review -> order request
- [x] Order review page: itemized lines, door style, trade tier, line + total, submit (OrderReview component + /order/new)
- [x] On submit: record order request (email-to-distributor copy logic deferred until distributor email wired; originator confirmation captured)
- [x] Code-to-master matching helper + unit tests (handles B24/W3030/BBC45 style codes, fuzzy)
- [x] Typecheck + vitest pass (149 tests); browser verified Manual match + submit + confirm flow end-to-end; DB persistence verified
- [x] Wired into TopNav ("Build an Order") and Home CTA; route /order/new (legacy /bulk-order redirects)

## Phase 7: Affiliate / Partner program (first affiliate: First Class Flooring & Cabinet Design)
- [x] DB: affiliates table (storeName, contactName, email, phone, website, location, status, referralCode unique, commissionRate, notes, userId nullable, timestamps)
- [x] Add "partner" role to user role enum; migration applied
- [x] Seed First Class as affiliate #1 (firstclassfcd@yahoo.com, (941) 899-3288, https://firstclassfcd.com, Osprey FL, 5% default commission)
- [x] Link order_requests to affiliate via referralCode/affiliateId column
- [x] tRPC affiliates router: admin create/update/list/get, byCode + bySlug + listActive (public), myAffiliate + myReferrals + updateMyStorefront (partner dashboard), adminReferrals
- [x] adminProcedure/partner gating; commission computed from confirmed order totals (shared/affiliate.ts helpers)
- [x] Link order_requests to affiliate via referralCode/affiliateId; attribution wired into createRequest
- [ ] Capture ?ref= referral code in order flow (persist to localStorage, send on createRequest) + optional manual code entry
- [ ] Admin UI: Affiliates management section (create/edit, view referrals + commission totals)
- [ ] Affiliate dashboard page (/affiliate): referral link, referred orders, earned commission, status
- [x] Unit tests: referral code generation/normalization, attribution on createRequest, commission calc, role gating (21 tests passing)
- [ ] Typecheck + vitest pass; browser verify admin create + ref attribution + dashboard

## Phase 7b: Branded affiliate storefront (Lily Ann / Cabinet Kings caliber)
- [x] Schema: affiliates table extended w/ storefront branding (slug, logo, colors, hero, tagline, about, service area, socials)
- [x] Seed First Class as affiliate #1 (slug firstclass, code FIRSTCLASS, 5% commission, partner access firstclassfcd@yahoo.com)
- [x] Public storefront /store/:slug — branded hero, door-style showcase, catalog browse, packages, design tool entry, build-an-order CTA
- [x] Storefront auto-tags affiliate referralCode (useReferral hook persists to localStorage; flows through to order requests — verified end-to-end)
- [x] Storefront uses affiliate primary/accent colors + logo; falls back to platform navy/gold branding
- [x] Affiliate storefront nav/footer with store contact, service area, socials ("Powered by Cabinet Dealz")
- [x] First Class storefront live at /store/firstclass
- [x] Partner Affiliate Dashboard (/affiliate): referral link, storefront link, referred-orders table, commission summary, branding editor
- [x] Admin Affiliates tab: list, create dialog, status toggle, per-affiliate referrals + commission view
- [x] Affiliate Portal link added to TopNav Portals dropdown
- [x] Verified: referral attribution (order CD-...M2LKA -> affiliateId 1, confirmed, $2128.20); 170 tests passing

## Phase 7c: Competitive homeowner (retail) pricing research
- [ ] Research competitor retail list prices: Lily Ann, Cabinet Kings, The RTA Store, Wholesale Cabinets, Kitchen Cabinet Kings, Cabinets.com, Home Depot/Lowe's stock
- [ ] Build a representative basket (popular base/wall/tall + a couple door styles) and gather comparable prices
- [ ] Compare to current computed homeowner prices; compute market median per item
- [ ] Recommend homeowner pricing posture: ~5% under market median, never below cost floor; deliver comparison table
- [ ] Present recommendation for user approval BEFORE changing live pricing

## Phase 8 (planned, per user preferences): Spanish-language storefront + CRM boards
- [ ] Spanish-language storefront option (prioritize Spanish-speaking customers) — i18n toggle on /store/:slug
- [ ] Admin CRM task/force board for sales (kanban: leads -> contacted -> quoted -> won/lost)
- [ ] Affiliate CRM board inside the affiliate dashboard (per-affiliate leads pipeline)
- [ ] Printable graph-paper design tool with Cabinet Dealz logo + QR code to site

## Phase 9: RTA-style storefront + Spanish toggle
- [ ] Storefront i18n: EN/ES dictionary + language toggle (English default, persists choice)
- [ ] Spanish translations for all storefront UI strings + First Class copy
- [ ] RTA-Store-style hero (full-width, headline, subhead, dual CTA Buy/Design)
- [ ] Shop-by-category tiles (Base, Wall, Tall, Vanity, Accessories)
- [ ] Featured door-styles section (cards with swatch + name)
- [ ] Package/kitchen deals section (reuse packages data)
- [ ] Value-prop strip (free design, all-plywood/soft-close, fast quote)
- [ ] Quote/Design CTAs carry referral code; SEO meta per storefront (no SKU counts)
- [ ] Typecheck + tests pass; browser-verify EN/ES + sections; checkpoint


## Phase 9: RTA-style storefront + family-lock + i18n (user request)
- [x] Source hero/category/door-style imagery; upload as webdev static assets
- [x] Storefront i18n module (EN/ES dictionary + useStorefrontLang hook, English default, localStorage)
- [ ] Family-lock rule: an order stays within ONE distributor + ONE cabinet family (door style/finish) to avoid multi-shipment shipping costs
- [ ] Backend: families list query (active door_styles w/ room scene, door style, species, finish, distributor)
- [ ] Backend: family-scoped catalog query (cabinets w/ published+available SKU for a styleId) + categories/subcategories within family
- [ ] Storefront flow: room scene -> pick family (style+distributor) -> categories -> subcategories, all locked to styleId
- [ ] Family-lock context (persist selectedStyleId/distributorId); lock banner with "Switch family" action
- [ ] EN/Espanol language toggle in storefront header
- [ ] RTA-style layout: image hero, value strip, image category tiles, featured door styles (room scenes), buy-now vs design choice, packages teaser, quote CTA
- [ ] AI cabinet recommender constrained to locked family/distributor (no cross-distributor suggestions)
- [ ] Package/galley/10x10 pricing: shipping shown as NOT included (remove 10% estimate)
- [ ] Typecheck + vitest pass; browser-verify family lock + EN/ES + sections; checkpoint


## Phase 9 verification + completion (2026-06-21)
- [x] Backend storefront router (families, doorStyleTypes, familyById, familyCategories, familySubCategories, familyCatalog, recommendForIntent — all family/distributor scoped)
- [x] Family-lock hook (useFamilyLock persists selectedStyleId/distributorId per slug to localStorage)
- [x] StorefrontShop component: family picker, lock banner ("Buying: <line>" + "Change Line"), category tabs, AI recommender scoped to locked family
- [x] Storefront.tsx rebuilt RTA-style: sticky header w/ EN/ES toggle, hero, value strip, StorefrontShop, how-it-works, quote CTA, branded footer
- [x] EN/ES toggle verified in browser (nav, value strip, section headers, lock banner all switch)
- [x] Family-lock flow verified: pick line -> locks catalog -> category tabs filter within line -> "Change Line" unlocks
- [x] Shipping shows "not included / quoted separately" (Envío no incluido — se cotiza por separado)
- [x] Improve AI recommender island synonyms ("kitchen island" now returns Base cabinets within the line; added synonyms + Base fallback; +1 test)
- [x] Checkpoint Phase 9

## Phase 10: Master catalog data review (user request — physical review)
- [ ] Export master catalog spreadsheet: code, description, category, subCategory, dimensions, numberOfDoors/Drawers, graphicType (image/graphic name) for every cabinet
- [ ] Known issue to verify: DWR-3 labeled "3\" Drawer Front" but user says it is a Dishwasher Return Panel (RTA)
- [ ] User physically reviews spreadsheet, marks corrections (real category + correct image/graphic name)
- [ ] Apply user-confirmed corrections back to DB (description/category/subCategory/graphicType)


## Phase 10 (revised): Catalog data-integrity audit & fix ("one product = one row")
- [x] Export full current DB catalog dump (code, description, category, subCategory, dims, doors/drawers, graphicType, lines_with_sku)
- [ ] Detect duplicate/conflicting rows: same item stored under >1 code with differing descriptions (lost July "known same as" cross-refs, e.g. BDEP vs DWR-3)
- [ ] Build conflict report grouped by likely-same product (shared graphicType / dims / cross-ref) for user review
- [ ] Obtain July master spreadsheet (authoritative nomenclature + cross "known same as" marks) from user
- [ ] Re-apply correct single name per physical product; collapse crossed duplicates into ONE canonical record, keep alternate code as alias so old SKUs/orders still resolve
- [ ] Verify storefront shows exactly one correct record per product (no duplicate/conflicting items)
- [ ] Tests + checkpoint


## Phase 11: Uniform canonical descriptions across July master
- [x] Clean Clark & Sons tab (strip color prefix, SKU tails, newlines, #REF!) -> column C
- [x] Extract US Cabinet Depot canonical description map (326 rows, 273 codes, clean)
- [ ] Pull verified cabinet-detail descriptions from live DB as top-priority golden source
- [ ] Build merged canonical map: cabinet-detail > US Cabinet Depot > Clark/Aspen, keyed by normalized code
- [ ] Apply uniform canonical description across ALL distributor tabs (Clark & Sons, Skyline, US Cabinet Depot, etc.)
- [ ] Report rows unified + list codes with no golden source (gaps) for user to fill
- [ ] Package corrected July master workbook and deliver


## Phase 12: Design Tool molding/trim expansion (NEW REQUEST)
- [ ] Catalog: ensure full molding/trim family exists as Accessory items (crown, decorative/dentil crown, rope molding, inset crown, scribe, light rail, batten/angle/shoe, fillers)
- [ ] Design Tool currently only offers toe kick + crown molding -> add the rest of the molding/trim options
- [ ] Allow STACKING/LAYERING of multiple trim pieces (e.g., crown + dentil strip on top + rope accent + light rail underneath)
- [ ] Crown molding length rule: add extra inches for cuts (e.g., +3" for a 12" sidewall -> cut 15")


## Phase 13: Decorative End Panel family DB fixes (confirmed by user + research)
- [x] DWR-3 (id122): "3" Drawer Front" -> "3" Dishwasher End Panel"; category Accessory; subCategory Decorative End Panel; 0 doors/0 drawers; flat-panel graphic
- [x] BDEP (id78): -> "Base Decorative End Panel"; Accessory; Decorative End Panel; flat-panel graphic
- [x] BEP-3 (id377): -> "3" Base Decorative End Panel" (same-as Dishwasher Panel); Accessory; flat-panel graphic; dims 3x34.5x24
- [x] TDEP-24-84/90/96: Accessory; Decorative End Panel; flat-panel graphic; TDEP-24-96 height typo fixed -> 96
- [x] WDEP-30/36/42: Wall Decorative End Panel; Accessory; flat-panel graphic
- [x] VDEP: Vanity Decorative End Panel; Accessory; flat-panel graphic
- [x] REPV-24/27-96: "24/27" Refrigerator Decorative End Panel"; Accessory; flat-panel graphic
- [x] Verify flat-panel graphicType value exists in cabinetGraphics; use correct token (e.g. accessory/panel) instead of door-1/door-2
- [ ] Note: Base End Panel = Dishwasher End Panel = same item (decorative panel for exposed sides/islands)


## Phase 14: Remaining catalog data fixes (pending user confirms)
- [ ] Tall Decorative End Panel = 2-panel kit: 54" bottom + (30/36/42) top -> 84/90/96 total. Confirm: does 1 unit = ONE side (2 stacked panels) or BOTH sides? Update TDEP descriptions to "...Kit (54" + X")" once confirmed
- [x] Skin/Island panels (BSV, FPV-42-96, S-24-96, USV-24-96, WSV-24/30/36/42): thickness 0.25"; subCategory "Skin Panel"; graphic accessory-strip; fixed dims; "cut to fit" wording. NOTE: island panels are large stock sheets (commonly 48x96 x 1/4") cut down on site
- [x] DECISION: decorative end panels and skin panels are DIFFERENT products - keep separate subcategories, do NOT group as same-as. Skin panel = 1/4" finished veneer to match cabinet color on unfinished/exposed side; cut to fit
- [x] Scribe molding (SM-8, id184) -> "3/4" x 96" Scribe Molding"; best-seller. NOTE: initially wrote to wrong id (193=U-18-84-24); restored that utility cabinet's description and re-applied to correct SM-8 id184 - verified on storefront
- [x] BFH-21 (id81), BFH-24 (id90), BT-09 (id95): recategorized Accessory -> Base, subCategory 'Single Door Base' (BFH = Base Full Height single-door, confirmed via RTA nomenclature lookup)
- [x] U-18-84-24..U-30-96-24 (ids 193-201): recategorized Accessory -> Tall, subCategory 'Pantry / Utility' (sit alongside oven cabinets + TS pantry under Tall, per user)
- [x] DECISION: no same-as/equivalent grouping added (user declined). Families stay separate by subCategory
- [ ] FINISH-MATCH RULE: skins & decorative end panels are style/species-specific - must match the cabinet's door style (e.g., Hickory cabinet exposed side needs a Hickory skin). Ensure skins/end panels carry the selected door-style finish through to quote/order
- [ ] TDEP tall end panel: ONE unit = ONE finished side (only outward face decorative; back is flat, brad-nailed to cabinet). Kit = 54" bottom + 30/36/42 top. Wording PENDING user check of model number


## Phase 15: Design Tool AI scope + accessory recommendations
- [ ] Constrain Design Tool AI strictly to kitchen/cabinet DESIGN topics (system prompt + guardrails); decline/redirect off-topic queries back to design
- [ ] AI proactively recommends complementary accessories based on placed items: roll-out trays (base cabinets), decorative end panels (exposed sides/islands), fillers (tight runs), crown/scribe molding (finishing tops), toe kick
- [ ] Keep recommendations within the customer's selected/locked line where applicable


## Phase 16: Catalog reclassification + Accessory sub-groups
- [ ] CLASSIFICATION RULE: test each item against Base / Wall / Tall / Vanity. If it is a real cabinet, put it there. If NOT (fillers, panels, moldings, glass doors, inserts) -> Accessory
- [ ] Verify OE-6-30/36/42 "Oven Filler Cabinet" via lookup; if it is a filler (not a real cabinet) -> Accessory / Trim & Molding
- [ ] Audit ALL items with "Cabinet" in the name that may not be real cabinets; audit every Accessory item
- [ ] Split Accessory into sub-groups via subCategory convention: "Trim & Molding", "Glass Door", "Accessory" (general)
  - Trim & Molding: scribe, crown, cove, shoe, light rail, base/angle/outside-corner molding, all fillers (F-*, BF, WF, TF, OE oven filler), batten
  - Glass Door: glass door fronts/inserts (description states it is a glass door; sold separately on lines like Faircrest)
  - Accessory (general): roll-out trays, waste bins, wood tray inserts, touch-up kit, legs, decorative legs, mini cabinet, floating shelves, skin panels, decorative end panels
- [ ] PRINCIPLE: storefront shows FAMILIES (door styles), categories must be clean/consolidated within a family - never scattered categories
- [ ] Glass doors: description identifies them; also offer as quick add-on/upsell when buying adjacent wall cabinet ("Make this a glass door?")
- [ ] Oven cabinets must NOT have glass doors (glass doors ordered separately) - per knowledge
- [ ] TOUCH-UP KIT: ensure a touch-up kit item exists in catalog (Accessory). In the Design Tool, ALWAYS auto-recommend it + one-click add-to-cart (standard "don't forget this" recommendation on every design)
- [ ] ROLL-OUT TRAYS: keep under Accessory (Roll-Out Tray sub-group). In Design Tool, when customer has placed base cabinets and is finishing, suggest "Want to add roll-out trays to any of these base cabinets?" with one-click add (smart, placement-aware recommendation)
- [ ] Verify reclassification on storefront: each family browses as clean Base/Wall/Tall/Vanity/Accessory(with sub-groups), no scattered categories


## Catalog reclassification + add-ons (user request, this session)
- [x] Reclassify non-cabinet items to Accessory (OE-6 oven fillers, fillers, moldings, panels); keep real cabinets in Base/Wall/Tall/Vanity
- [x] GD codes (e.g. W-24-30GD) incl. 12" stackers stay as real WALL cabinets (not Accessory)
- [x] Roll-out trays (RS-18..RS-36) under Accessory / "Roll-Out Tray" sub-group; RS-15 (rope scribe) stays Trim & Molding
- [x] Storefront Accessory sub-group tabs collapse micro-categories into Trim & Molding / Accessories (no scattered categories)
- [x] Glass-door upsell: "Make this a glass door?" swap on solid WALL cabinets that have a buyable GD twin (oven/tall excluded)
- [x] Design Tool "don't forget" strip: touch-up kit always + roll-out trays when base cabinets placed (one-click add to build sheet)
- [x] CHECKOUT: auto-suggest touch-up kit (Accessory) in order review with one-click "Add TUK"; prices from selected style/tier ($48 @ Aura Blanc/Contractor), rolls into total, prompt hides once added (browser-verified)
- [x] Tests for glassDoorUpsell + addOnRecommendations + checkout touchUpKit (resolves + real price); typecheck clean; 188 tests pass; browser verified
