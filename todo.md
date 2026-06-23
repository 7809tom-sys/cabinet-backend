# Cabinet Dealz — Project TODO

## Phase 1: Database & Data Foundation
- [x] Design and apply full database schema (cabinets, styles, distributors, pricing, users, orders)
- [x] Seed all 393 cabinet items from master spreadsheet
- [x] Seed 61 door styles from CD_STANDARDS
- [x] Seed distributor records (US Cabinet Depot, Clark & Son, Skyline)
- [x] Seed 10,643 distributor SKUs with pricing tiers (Wholesale, Contractor, Homeowner)
- [x] Seed blind corner cabinet measurements (12 cabinets: base openingWidth 15/minPull 3/maxPull 9, wall 12/2/6)
- [x] Cabinet/door visuals (DESIGN DECISION, not literal "upload every image to CDN"): (a) cabinet 2D graphics are intentionally CODE-RENDERED to-scale SVGs (CabinetDrawing) driven by real dimensions/door/drawer data + live finish recolor — superior to static per-cabinet files; (b) door samples = 5 photorealistic watermark-free family hero photos (shaker/raised/slab/beaded/inset) on CDN conveying PROFILE, paired with the color-accurate DoorStyleSwatch conveying exact COLOR per style; wired into Door Styles grid+dialog + Cabinet Detail; doorFamilyPhotos.ts + unit tests

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
- [x] Photo upload UI for floor plan images — /photo-to-cart page (drag/choose image, preview, 8MB guard)
- [x] OCR processing via LLM vision to extract cabinet codes — ocr.extractFromImage (protected), strict JSON-schema vision call; verified live (read 5/5 codes+qty from a generated list image)
- [x] Code-to-Master-ID matching and cart population — shared/cabinetCodeMatch.ts (exact/normalized/fuzzy, qty coercion, candidates); review UI -> pick one door style (family-lock) + tier -> add all to cart; 10 matcher + 3 router tests
- [ ] CSV upload bulk ordering
- [ ] Barcode scan ordering interface
- [ ] Order review and confirmation

## Phase 7: Portals & Admin
- [x] Distributor portal: product visibility toggle (private vs. published) — /distributor page, per-SKU + role-scoped; distributorPortal.setVisibility/bulkSetVisibility with line-ownership guard; users.distributorId link added (migration 0008); distributorProcedure gate; 5 tests
- [x] Distributor portal: catalog management and order view — catalog tab (search/style/category/hidden-only filters, live counts) + orders tab (submitted orders referencing this line's styles, originator contact intentionally hidden from supplier); admin can act on any line via picker. Search runs in SQL WHERE before pagination (total reflects filter); loading/error+retry/empty states for line/catalog/orders; 7 portal tests (search-count + orders assertions)
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
- [x] Remove distributor brand names from Home.tsx (hero copy, featured styles, distributor strip, footer) — verified: Home self-brands as Cabinet Dealz, no supplier names
- [x] Remove distributor brand names from Door Styles, Catalog, Cabinet Detail, Design Tool — all render inside AppLayout/TopNav (Cabinet Dealz brand); public catalog API scrubs supplier fields; grep CLEAN
- [ ] (SUPERSEDED? — needs user confirm) Remove Homeowner pricing tier (keep Wholesale + Contractor trade tiers) — conflicts with revised "keep trade ordering path" + the cart/checkout user explicitly requested this session
- [ ] (SUPERSEDED? — needs user confirm) Remove consumer buy path: "Sign In to Order", "Add to Cart", cart icon, homeowner audience card/CTA — user later asked to BUILD cart + "Request this order"; awaiting direction
- [ ] (SUPERSEDED? — needs user confirm) Update homepage messaging to trade/wholesale audience (no homeowner selling)
- [x] Verify no brand names remain in UI — leak audit grep CLEAN outside admin-gated import; server/whitelabel.test.ts asserts no brand strings in public APIs. (Note: trade buy/design path intentionally retained per revised white-label direction.)

## Per-Distributor White-Label Model (revised direction)
- [x] Home page white-labeled + Cabinet Dealz self-branding (hero, audience, supply strip, footer)
- [x] Add `whiteLabel` boolean column to distributors table (default true = hidden) — plus brandName/brandInitials/displayMode/seriesName/markupPercent; migration applied
- [x] API returns real brand name only when whiteLabel = false (displayMode=branded), else neutral label — server/lib/presentation.ts resolvePresentation()
- [x] All three current distributors set to white-labeled (hidden): Line A/B/C, whiteLabel=1, neutral displayMode; real brands (US Cabinet Depot/Clark & Son/Skyline) internal-only
- [x] Door Styles / Catalog / Cabinet Detail / Design Tool respect whiteLabel flag — public catalog router scrubs descriptionSource + distributorName; brandName only exposed via adminProcedure (Distributors import tab); added server/whitelabel.test.ts (6 leak-guard tests)
- [x] Cabinet Dealz brand strong across all customer-facing pages (hero self-branding, no supplier names anywhere user-facing — leak audit grep CLEAN outside admin-gated import)
- [x] Product image watermarks never show distributor/dealer names — all imagery is platform-controlled (DoorStyleSwatch SVGs + watermark-free generated door-family photos); grep for brand-bearing image URLs returns NONE
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


## Cabinet imagery: to-scale 2D drawings per model (user request — ~380 models, image must match model + size) — SUPERSEDED by the completed block below (all items shipped via CabinetDrawing)
- [x] Build CabinetDrawing SVG component: proportions from real width/height (12" narrow vs 30" wide)
- [x] Front detail by type: standard doors, drawer base, sink base (tilt-out + cutout), appliance garage (tambour), blind corner (L-shape), vanity, ADA, accessory/molding
- [x] Derive drawing type from category/subCategory/masterCode + numberOfDoors/numberOfDrawers
- [x] Replace generic Package icon on Catalog cards with CabinetDrawing
- [x] Replace generic Package icon on Cabinet Detail with CabinetDrawing
- [x] Use CabinetDrawing in Design Tool palette/canvas
- [x] Unit tests for drawing-type selection + proportion
- [x] Typecheck + vitest pass
- [x] Browser verify: 12" vs 30" drawer base differ, sink base tilt-out+cutout, appliance garage tambour
- [x] Checkpoint


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
- [x] OCR: photo/quote upload -> LLM vision extracts cabinet codes + qty -> match to master cabinet IDs (base64 data URL, no upload roundtrip) [RE-VERIFIED 2026-06-21: generated realistic 9-line quote sheet -> 8/9 auto-matched incl. B24/SB36/DB24-3/W3030/W1530/BBC45/OE-6-30 w/ correct qty; only an out-of-catalog pantry variant fell to the unmatched review lane as designed]
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
- [x] Admin CRM task/force board for sales (kanban New->Contacted->Qualified->Quoted + Won/Lost closed lane); drag-to-move, deal drawer w/ activity timeline, stat chips, Import Leads (pro apps + order requests), New Deal dialog
- [x] Affiliate CRM board inside the affiliate dashboard (per-affiliate scoped pipeline, same CrmBoard component; affiliate sees only their own deals + their referred order requests as importable leads)
- [x] CRM bilingual EN/ES labels + per-deal customer-language flag (supports Spanish-speaking customers); crm_deals + crm_activities tables; role-aware scoping (admin=house, partner=own affiliate); 193 tests pass; browser-verified
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
- [x] Family-lock rule: backend now ENFORCES single-family on order submit — shared/familyLock.ts validateFamilyLock() wired into orders.createRequest (rejects mixed-style submit with BAD_REQUEST); Cart shows a lock banner + disables "Request this order" when the cart mixes door styles. 7 familyLock tests added
- [x] Backend: families list query (storefront.families — active styles w/ distributorId, no supplier name)
- [x] Backend: family-scoped catalog query (storefront.familyCatalog + familyCategories/familySubCategories, all styleId-scoped)
- [x] Storefront flow: pick family -> lock -> category tabs filtered within line (StorefrontShop, Phase 9 verified)
- [x] Family-lock context (useFamilyLock persists selectedStyleId/distributorId per slug); lock banner with "Change Line" action
- [x] EN/Espanol language toggle in storefront header (verified Phase 9: nav/value strip/headers/lock banner all switch)
- [x] RTA-style layout: hero, value strip, StorefrontShop, how-it-works, quote CTA, branded footer (Phase 9)
- [x] AI cabinet recommender constrained to locked family/distributor (storefront.recommendForIntent scoped to styleId; test asserts every recommended SKU belongs to the family)
- [x] Package/galley/10x10 pricing: shipping shown as NOT included / quoted separately (Phase 9)
- [x] Typecheck + vitest pass; browser-verified family lock + EN/ES + sections; checkpointed (Phase 9)


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
- [x] Export master catalog spreadsheet: code, description, category, subCategory, dimensions, numberOfDoors/Drawers, graphicType + linesWithSKU for every cabinet — admin endpoint distributorAdmin.catalogExport + "Download master catalog (CSV)" button in Admin > Distributors; shared/catalogExport.ts pure builder (8 tests); generated cabinet-dealz-master-catalog.csv (388 cabinets) delivered to user for physical review
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
- [x] Catalog: full molding/trim family exists as Accessory items — verified (2026-06-23): crown profiles CM-2/4/8, angle crown ACM-8, base crown BCM-8, cove COV, light rail ALRM-8, batten BAM, furniture base FBM, fillers (BF/BFF/F-3/F-6 wall+tall), skins, corner trim
- [x] Design Tool now offers Toe Kick + Crown + Batten + Light Rail + manual Filler (was only toe kick + crown). Each is an independent toggle shown in Front View + added to the BOM/CSV
- [x] Allow STACKING/LAYERING of multiple trim pieces — crown, batten, and light rail are independent toggles that can all be on at once (crown caps the top, light rail runs under uppers, batten covers seams) and each adds its own BOM line
- [x] Crown/light-rail length rule: +3" miter allowance per WALL run (miteredTrimInches / MITER_ALLOWANCE_IN) — e.g. a 12" sidewall yields a 15" cut (covered by vitest)


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
- [x] Constrain Design Tool AI strictly to kitchen/cabinet DESIGN topics — consult SYSTEM prompt restricts to choosing a fill strategy; assistant SYSTEM prompt redirects off-topic ("I can help with cabinets, door styles, and your kitchen project"); both never name suppliers
- [x] Proactively recommend complementary accessories based on placed items — "Don't forget" cards: touch-up kit (always), roll-out trays (base cabinets), decorative end panels (any exposed base/wall/tall side), crown molding (wall cabinets); plus one-click range/oven clearance filler + blind-corner filler when those conflicts exist
- [x] Keep recommendations within the selected/locked line — findAddOns resolves every suggestion against the locked styleId's buyable distributorSkus; a card only renders when it resolves to a real orderable SKU in that style (3 new vitest cases)


## Phase 16: Catalog reclassification + Accessory sub-groups
- [x] CLASSIFICATION RULE applied & audited (2026-06-23): every non-cabinet (fillers, moldings, scribes, panels, skins, end panels) is under Accessory; real cabinets stay in Base/Wall/Tall/Vanity/ADA
- [x] OE-6-30/36/42 verified: it is NOT an oven filler — it's a "Wall Open End Shelf" (6"W open display shelf that mounts on the wall = a real cabinet). Correctly classified Wall / Specialty Wall; no move needed
- [x] Audited all non-Accessory items whose description contains filler/molding/scribe/light rail/end panel/skin: the ONLY hits are legitimate glass-door WALL cabinets (DCW-*GD, W-*GD) which correctly stay in Wall per the GD decision. Zero misclassified accessories remain in cabinet categories
- [x] Accessory already sub-grouped via subCategory: Trim & Molding, Decorative End Panel, End Panel, Skin Panel, Roll-Out Tray, Wood Tray Insert, Waste Bin Insert, Floating Shelf, Decorative Leg, Full Height Panel, etc. (glass doors are real Wall cabinets, not an Accessory sub-group)
- [x] PRINCIPLE upheld: storefront browses FAMILIES (door styles) -> clean Base/Wall/Tall/Vanity/ADA/Accessory categories, no scattered categories (verified in earlier storefront check)
- [x] Glass doors: GD wall cabinets + stackers stay in Wall (real cabinets, description identifies); "Make this a glass door?" upsell swaps solid wall cabinet -> buyable GD twin on storefront (tested)
- [x] Oven cabinets must NOT have glass doors (glass doors ordered separately): glassDoorUpsell only fires for wall codes (W/AW/DCW/WER/WD); oven (O-/MO-) + tall (U-/TS-) excluded by construction
- [x] TOUCH-UP KIT: exists in catalog (Accessory); Design Tool always auto-recommends + one-click add; ALSO auto-suggested at checkout (order review) with one-click Add TUK (priced per style/tier) — browser-verified
- [x] ROLL-OUT TRAYS: under Accessory (Roll-Out Tray sub-group); Design Tool "don't forget" strip suggests them when base cabinets are placed, one-click add
- [x] Verify reclassification on storefront: each family browses as clean Base/Wall/Tall/Vanity/Accessory(with sub-groups), no scattered categories


## Catalog reclassification + add-ons (user request, this session)
- [x] Reclassify non-cabinet items to Accessory (OE-6 oven fillers, fillers, moldings, panels); keep real cabinets in Base/Wall/Tall/Vanity
- [x] GD codes (e.g. W-24-30GD) incl. 12" stackers stay as real WALL cabinets (not Accessory)
- [x] Roll-out trays (RS-18..RS-36) under Accessory / "Roll-Out Tray" sub-group; RS-15 (rope scribe) stays Trim & Molding
- [x] Storefront Accessory sub-group tabs collapse micro-categories into Trim & Molding / Accessories (no scattered categories)
- [x] Glass-door upsell: "Make this a glass door?" swap on solid WALL cabinets that have a buyable GD twin (oven/tall excluded)
- [x] Design Tool "don't forget" strip: touch-up kit always + roll-out trays when base cabinets placed (one-click add to build sheet)
- [x] CHECKOUT: auto-suggest touch-up kit (Accessory) in order review with one-click "Add TUK"; prices from selected style/tier ($48 @ Aura Blanc/Contractor), rolls into total, prompt hides once added (browser-verified)
- [x] Tests for glassDoorUpsell + addOnRecommendations + checkout touchUpKit (resolves + real price); typecheck clean; 188 tests pass; browser verified


## Session: prioritized features (#3 visuals, #4 CRM, #1 OCR, #2 cart) — 2026-06-21
- [x] #3 Visuals: 5 photorealistic door-family hero photos (shaker/raised/slab/beaded/inset) on CDN + color-accurate DoorStyleSwatch chip; wired into Door Styles grid+dialog and Cabinet Detail; cabinet 2D drawings remain code-rendered SVGs (intentional). doorFamilyPhotos.ts + tests
- [x] #4 CRM: crm_deals + crm_activities tables; role-aware crm router (admin=house, partner=own affiliate); reusable CrmBoard (Kanban New->Contacted->Qualified->Quoted + Won/Lost, deal drawer w/ activity timeline, stat chips, Import Leads from pro apps + order requests, New Deal); Sales CRM tab in Admin + My CRM tab in Affiliate dashboard; bilingual EN/ES + per-deal customer-language flag; insertId fixed to result[0].insertId; crm.test.ts
- [x] #1 OCR photo-to-cart: confirmed already fully built (Scan a Photo -> orders.extractFromImage vision LLM -> match -> editable review). RE-VERIFIED end-to-end with a generated 9-line quote sheet: 8/9 auto-matched w/ correct qty; out-of-catalog variant fell to unmatched review lane as designed
- [x] #2 Cart + checkout w/ location availability: localStorage CartContext (cabinet+style+tier+distributorId+qty+price), TopNav live badge, working Add to Cart on Cabinet Detail, real /cart page (qty stepper, remove, subtotal, touch-up-kit-at-checkout note), Delivery ZIP availability check (shared/availability.ts haversine + ZIP centroids; location router resolves customer ZIP via Google geocode w/ offline fallback; per-item in-range/nearest-miles/lead-time badge), "Request this order" hands cart -> OrderBuilder review via sessionStorage + matchCodes. Browser-verified (Dallas 75201 -> all available ~0mi ~7-day; handoff loaded 1 matched). shared/availability.test.ts + server/location.test.ts
- [x] Bugfix: B-24 (and other real Base/Wall/Tall/Vanity/ADA cabinets) no longer mislabeled "accessory / trim" — cabinetDrawingType now treats real cabinet families as non-accessory even when description mentions shelf/panel; keyword heuristic is fallback-only. cabinetGraphics regression tests added
- [x] 209 tests pass; typecheck clean
- [x] SEO: removed explicit count strings from public pages (Door Styles "N finishes available", Cabinet Detail "(N available)", Home "dozens of door styles") per "avoid displaying specific numbers of SKUs/styles" guideline; typecheck clean

## Session: Distributor spreadsheet onboarding — 2026-06-21
- [x] Distributor CSV onboarding: shared/distributorImport.ts (pure CSV parser + flexible column mapping for code/description/category/subCategory/dimensions + optional per-style price columns); server/routers/distributors.ts distributorImportRouter.importPreview (dry-run diff: create/update/price/error counts + per-row) and importCommit (upsert cabinet info/descriptions + optional per-style pricing; new prices land UNPUBLISHED for review); mounted under distributorAdmin namespace; client/src/components/admin/DistributorImport.tsx (template download, paste/upload CSV, preview table, commit) wired into Admin "Distributors" tab. 16 import tests incl. live preview->commit->idempotent-reimport round-trip


## Session: Customer Tier Management + Tawk.to live chat (user request)
Direction confirmed: KEEP all 3 tiers (Homeowner/Contractor/Wholesale) + KEEP cart/buy path. A logged-in user's pricing is set by the tier the OWNER assigns them after seeing them on the site. Homeowner is the default tier until changed. Tawk.to handles the "someone is on the site" ping (owner uses the Tawk mobile app); when pinged, owner logs into the site admin and assigns the tier.

- [x] (SUPERSEDED — WON'T DO) Remove Homeowner pricing tier — confirmed: keep all 3 tiers
- [x] (SUPERSEDED — WON'T DO) Remove consumer buy path / cart — confirmed: keep cart + "Request this order"
- [x] (SUPERSEDED — WON'T DO) Homeowner-only trade messaging — confirmed: all audiences, tier set by approval
- [ ] Add `pricingTier` enum field to users table (homeowner | contractor | wholesale), default homeowner; migration applied
- [ ] db helper: list users with tier + assign tier; expose effective tier on auth.me
- [ ] adminProcedure: customers.list (search/paginate users w/ tier, role, last-seen) + customers.setTier
- [ ] Admin "Customers" tab: table of users with one-click tier assignment + toast + optimistic update
- [ ] Storefront/catalog pricing resolves to the logged-in user's assigned pricingTier (default homeowner for guests/unassigned)
- [ ] Tests: tier default, setTier admin-gated, pricing resolver picks correct tier column
- [ ] Embed Tawk.to widget site-wide via env (VITE_TAWK_PROPERTY_ID / VITE_TAWK_WIDGET_ID); no-op if unset; ready for user's snippet
- [ ] Checkpoint + deliver; request Tawk.to embed code from user


## Session: Storefront line-card images fix (Jun 21)

- [x] Bug: affiliate storefront ("First Class") cabinet-line cards showed blank gray boxes — DB roomSceneImageUrl/thumbnailImageUrl point at /room-scenes/*.jpg and /thumbnails/*.jpg files that were never uploaded, so the `<img>` rendered broken
- [x] Storefront now prefers doorFamilyPhoto() (the real uploaded CDN webp door photos already used by the Door Styles page) over the broken DB image paths
- [x] Added FamilyCardImage helper: shows the photo when it loads, falls back to the color-accurate DoorStyleSwatch on empty OR broken (onError) — applied to the line-picker grid and the locked-family thumbnail
- [x] Verified live in browser + screenshot; tsc clean; 252 tests passing


## Session: Customer Tiers + AI Chat / Tawk Handoff (Jun 21)
- [x] users.pricingTier enum (homeowner default / contractor / wholesale) + companyName column applied to live DB (reconciled schema/DB drift — companyName was missing)
- [x] shared/pricingTier.ts pure resolver (tier -> effective price + label); 12 tests
- [x] customers admin router: list (search + tier filter + counts) and setTier (adminProcedure); 6 tests
- [x] Admin > Customers tab UI (CustomersAdmin): user list, tier badges, search/filter, one-click tier assignment
- [x] assistant.chat router: cabinet/kitchen-scoped AI helper, white-labeled (never names suppliers); 3 tests incl. live on-topic reply + brand-leak guard
- [x] ChatWidget floating bubble site-wide (AI assistant via AIChatBox) with "Talk to a live person" handoff
- [x] Tawk.to integration (client/src/lib/tawk.ts): config-driven via VITE_TAWK_PROPERTY_ID / VITE_TAWK_WIDGET_ID; graceful no-op + friendly toast until configured
- [ ] User to create free Tawk.to account and provide Property ID (then live chat ping works on their phone)
- [ ] (Deferred, needs user confirm) Calibrate homeowner retail prices against RTA Store market comparison
- [x] AI chat + "Talk to a live person" widget confirmed GLOBAL on every site (mounted outside Switch): main site, all pages, and affiliate storefronts like /store/firstclass (verified via screenshot) + future affiliate stores automatically


## Session: Room Scenes as Hero Imagery (Jun 21 — user: "people buy the dream kitchen, not a door")
- [x] Inventory existing kitchen/room-scene imagery (doorFamilyPhotos + any uploaded scenes); identify which styles lack a real kitchen scene
- [x] Generated 5 full kitchen room scenes (white shaker, gray shaker + navy island, cherry raised panel, natural slab, espresso shaker) — watermark-free, no supplier names; hosted on project CDN
- [x] Added kitchenSceneFor() resolver: maps every door style to the best scene by panel family + finish bucket (white/gray/dark/warmwood/lightwood); 7 vitest tests
- [x] Storefront line cards lead with the KITCHEN ROOM SCENE; door swatch demoted to a small corner detail chip; "Shop This Kitchen" CTA (EN+ES strings family_door_detail added)
- [x] Storefront locked-line view gets a full kitchen scene banner header
- [x] Storefront hero rebuilt to two columns: copy/CTAs + large kitchen lifestyle photo with floating "Local & Family-Owned" proof card
- [x] Main Home hero rebuilt with kitchen lifestyle collage; added "Find Your Kitchen Style — Shop the Look" scene mosaic section
- [x] Verify across storefront + home (desktop), full test suite (289 pass) + typecheck clean, checkpoint


## Ideas to Think About (Future / Not Scheduled)
- [ ] NetSuite integration (many distributors use NetSuite). Possible directions to scope later: (a) pull live inventory/availability per line, (b) sync each distributor's pricing/cost tiers automatically, (c) push dealer orders back into the distributor's NetSuite as sales orders/POs. Notes: server-side token-based auth; each distributor authorizes their OWN NetSuite account; field mappings differ per instance (custom fields/item naming); biggest hurdle is distributors providing API access. Revisit with user — DISCUSS LATER, not started.


## Pre-Launch Hardening Pass (before 10,000-contact campaign)
- [x] Hardened OAuth sign-in callback: detailed upstream-error logging for diagnosis + graceful redirect home with friendly toast instead of dead 500 JSON page (3 regression tests). NOTE: definitive live confirmation requires clicking Sign In on the published site after next publish (sandbox can't reproduce the live domain redirect).
- [x] QA critical money/lead flow: signup paths verified — Pro Network application form (required-field validation) and affiliate attribution by referral code; server tests green
- [x] QA critical money/lead flow: Build an Order (/order/new, /bulk-order) renders 3 input modes (Scan/CSV/Type); order submission server flow verified (family-lock, totals, draft/submitted/confirmed) + tests
- [x] QA critical money/lead flow: AI assistant / contact handoff bubble present on all pages
- [x] QA storefront experience: branding + kitchen photos load, full cabinet-line grid, catalog category tiles; EN + ES verified. ES string table complete (72/72 keys)
- [x] QA responsive/mobile: home + storefront verified at 375px (hero stacks, nav collapses, CTAs reachable, ES toggle visible)
- [x] ENHANCEMENT: storefront auto-detects browser language + honors ?lang= deep link (campaign links can target Spanish) — 5 tests
- [ ] KNOWN LIMITATION (not blocking): affiliate's custom hero headline + description are single-language brand copy and do NOT translate to ES; platform UI strings do. Future: add per-affiliate Spanish copy fields
- [x] Verified key pages render with loading/empty handling; door swatch remains fallback if a kitchen scene image fails
- [x] Full automated suite green: 301 tests / 33 files pass; typecheck clean. Added 8 tests (3 OAuth callback + 5 language detection)
- [ ] Final checkpoint + launch-readiness report (in progress)


## Catalog Imagery Upgrade (3D product renders + kitchen-scene lead-in)
- [x] Audited SKU rendering: cards + detail page previously used flat to-scale CabinetDrawing as the primary image
- [x] Generated dimensional 3D-style product renders (base in white/gray/cherry/espresso, wall in white/gray/cherry, plus tall/vanity/accessory white), three-quarter studio angle, watermark-free, no distributor names; hosted on project CDN
- [x] Added cabinetProductPhoto() resolver (category + finish bucket -> best render, graceful fallback chain) + 6 tests
- [x] Catalog grid card now leads with the 3D render; to-scale drawing demoted to a small corner badge
- [x] Detail page: 3D render is the primary 'Product' image with a 'Dimensions' tab for the to-scale drawing; render updates with selected door style finish
- [x] Buying flow now leads with a kitchen-scene banner + kitchen title/description (kitchenSceneWithCopy resolver, 3 tests) before the item
- [x] Verified desktop + mobile (375px); 310 tests pass; typecheck clean; checkpoint


## 3D Render Set Expansion (full finish coverage per category)
- [x] Generated wall render in espresso/dark finish
- [x] Generated tall renders in gray, cherry, espresso
- [x] Generated vanity renders in gray, cherry, espresso
- [x] Generated accessory renders in cherry/warm wood + espresso/dark
- [x] Extended cabinetProductPhoto map: every category now covers white/gray/cherry/espresso (wall, tall, vanity); accessory covers white/warmwood/dark
- [x] Updated resolver tests for new variants (18 tests in doorFamilyPhotos.test.ts)
- [x] Typecheck clean, 312 tests pass, verified wall + tall detail pages render kitchen-scene lead-in + 3D image, checkpoint


## Catalog: Door-Style-First (remove Shop by Category)
- [x] Removed "Shop by Category" tiles from Catalog landing
- [x] Replaced with "Shop by Door Style" section (5 scene tiles) linking to /styles
- [x] Category drill-in kept under the hood for search + design tool
- [x] Typecheck + 312 tests pass, verified, checkpoint

- [x] Door Styles page: each card now shows a per-style kitchen room scene (rendered in the exact finish) as the backdrop WITH the door profile sample on top + true-color chip


## Bug Fixes (vanity depth + wrong generic render)
- [x] Vanity depth bug FIXED: 15 vanity SKUs corrected from 12" -> 21" deep (V-30/33/36 series + VS-30/36, VDB-12-3, VDB-21-3, VSD-48); left VA-* aprons at 3" and BFH-* furniture vanities at 24". Verified V-30-21DL now reads Depth 21.00"
- [x] Wrong generic render FIXED: Accessory category (trim/molding, panels, shelves, fronts, inserts) was showing a single crown-molding glamour photo for everything. cabinetProductPhoto() now returns null for accessories and both the catalog card + detail page fall back to the accurate item-specific to-scale drawing. Real cabinet boxes (base/wall/tall/vanity/ada) keep their 3D renders. Verified DWR-3 now shows the correct end-panel drawing. Tests updated (312 pass).


## CRITICAL REBUILD — Family-first shopping + correct images (user feedback Jun 22)
- [x] Server: doorStyles.familyCatalog procedure — given styleId, return door style info + ALL cabinets available in that style (joined via distributor_skus), each priced in this style + category + subCategory; collapse duplicate supply lines to one row per cabinet (lowest contractor price). Added doorStyles.byCode for /family/:styleCode routing.
- [x] New /family/:styleCode page: room scene + sample door + facts header, then full cabinet grid filterable by type (All/Base/Wall/Tall/Vanity/ADA/Trim). Door style pre-locked via ?style= so the detail page opens in that finish.
- [x] Make door-style FAMILY the primary shop entry: Home "Shop the Look" tiles link into /family/:styleCode (live styles, deduped by finish bucket); TopNav "Shop by Style" first; Door Styles dialog has "Shop this collection"; Catalog tiles link to families.
- [x] CORRECT images: replaced the generic/wrong 3D photo with the accurate to-scale CabinetDrawing (driven by real dims + door/drawer counts + subCategory) as the primary product image on catalog cards, family cards, and the detail page — so a drawer base draws drawers, a sink base shows a sink, a blind corner draws the L, recolored to the family finish.
- [x] Finish-accurate scenes/doors: hardened finishBucket so black/espresso wins over wood species, oak/natural reads light-wood, etc.; family/detail/storefront scenes now combine color+name+species keywords so dark & warm families no longer collapse onto the generic white scene.
- [x] Tests: added server/family.test.ts (familyCatalog populated + multi-category + deduped + priced; byCode resolve + null) and finish-bucket scene tests; full suite green (315 passing); verified desktop + mobile.


## BUGS — White scene + door-count drawing (user feedback Jun 22, 2nd round)
- [ ] White family (Lumina White / SW 7006 Extra White) shows a CHERRY kitchen scene. A white cabinet MUST show a white kitchen. Fix finishBucket so "extra white"/white never falls to cherry/dark.
- [ ] The wood scene we use should be a room-STAIN finish, not red cherry. Replace/relabel cherry scene with a neutral stained scene.
- [ ] Card label vs picture mismatch: title says "Single Door Wall" but tag says "Double Door Wall", and the to-scale drawing shows the same single door for both. Drawing must match the actual door count (double = 2 doors) and the title/tag must agree.


## BUGS — Image correctness round 2 (user feedback Jun 22)
- [ ] White family (Lumina White / SW 7006 Extra White) shows a CHERRY kitchen scene. White cabinet MUST show a white kitchen. Fix finishBucket: "extra white"/white never falls to cherry/dark.
- [ ] The wood/traditional scene must read as a room STAIN finish, not red cherry. Use a neutral stained scene.
- [ ] Card label vs drawing mismatch: title "Single Door Wall" while tag "Double Door Wall"; drawing shows one door for both. Drawing must match real door count (double = 2 doors); title and tag must agree (use real numberOfDoors).
- [ ] Door-style browse cards: big door preview is the same cream door for every style; it must render in the actual style color (Oxford Sage = green, Oxford Toffee = gold) like the corner swatch does.


## REAL PER-STYLE IMAGES (sourced from public distributor pages)

- [ ] Collect real room-scene + door image URLs for all 61 families (search by real door name; widely sold across distributors)
- [ ] Download images, host on our CDN (manus-upload-file --webdev), store roomSceneImageUrl + doorSampleImageUrl per door style
- [ ] Wire family page hero, door-style cards, and home showcase to use per-style images (fallback to finish-colored drawing only if missing)
- [ ] Fix the to-scale drawing + label door-count mismatch (double door draws 2 doors; title/tag agree)
- [ ] Verify white shows white kitchen (no cherry), sage shows sage, etc.; test + screenshots desktop/mobile; checkpoint


## STRICT ONE-FAMILY-ONE-COLOR (user mandate: no mixing, no fallbacks, ever)
- [ ] Remove ALL bucket/keyword scene-guessing fallback from the family page, door-style cards, and home showcase. A family shows ONLY its own stored roomSceneImageUrl / doorSampleImageUrl.
- [ ] If a family has NO verified photo: show a clean, color-accurate door-panel placeholder (in that family's finish) — NEVER another family's photo or a generic stock scene.
- [ ] Every cabinet drawing on a family page stays recolored to that family's exact finish — confirm no item renders in a different color.
- [ ] Carry the locked family finish through to the cabinet detail page (already via ?style=).
- [ ] Audit all 61 families: which have a verified-correct photo vs which are missing/uncertain. Produce a clear gap list for the user to supply photos.
- [ ] Hand the user the gap list; drop user-supplied photos straight into the matching family.
- [ ] Tests green; screenshot Sage + White + a dark family to confirm zero color mixing; checkpoint.

## SKU Model Rebuild + Master SKU Spreadsheet (from july_master.xlsx)
- [x] Reverse-engineer july_master.xlsx (distributors, color maps, API_Export grid, pricing tabs)
- [ ] Define canonical SKU: DISTRIBUTOR-STYLE-CABINET (e.g. CS-ASP-B21); distributor codes CS/SKY/UCD
- [ ] Build master SKU spreadsheet: one row per unique SKU across all 3 distributors (unpivot per-color pricing)
- [ ] Columns: SKU, distributor(hidden), family/color(public Our Name), internal door name, category, sub-category/type, description, W/H/D, List, Adjusted List, Our Cost, Homeowner, Contractor, Wholesale, image
- [ ] Make image human-friendly: embed thumbnail in the .xlsx (so user sees the photo, not a URL)
- [ ] Validate: total SKU count (~25-30k), per-distributor counts, unmapped colors/cabinets report
- [ ] Add imageUrl column to distributor_skus schema; generate + apply migration
- [ ] Rebuild platformSku in DB to DISTRIBUTOR-STYLE-CABINET format
- [ ] Wire SKU-level image into family-first flow (fall back to accurate drawing when blank)
- [ ] Build foolproof visual image-management admin page (see photo -> click Replace -> upload, no URLs)
- [ ] Admin SKU import/export (upload edited master sheet to update prices + images)
- [ ] Tests + checkpoint + deliver master spreadsheet to user

## SKU-Level Images (CONFIRMED: image is per SKU = cabinet + door style)
- [x] Master SKU build from july_master.xlsx (14,901 SKUs, 3 distributors, categories cleaned)
- [ ] Rebuild workbook: per-distributor tabs, ONE ROW PER SKU, grouped by door style, with per-SKU image column
- [ ] Add SKU-level imageUrl to distributor_skus schema (migration + apply)
- [ ] Rebuild platformSku to DIST-STYLE-CABINET (e.g. CS-ASP-B21)
- [ ] Storefront resolves image at SKU level (fallback to door-style image, then drawing)
- [ ] Batch image uploader: auto-match filenames (CS-ASP-B21 / ASP-B21 / B21-ASP / Aspen-B21) to SKUs; report unmatched
- [ ] Repeatable distributor import: upload sheet -> alias-resolve -> auto-category -> generate SKUs
- [ ] Tests + checkpoint + deliver workbook to user

## SKU Image Management (front-end)
- [ ] DB: imageUrl + supplierCabinetName on distributor_skus (DONE)
- [ ] Storefront resolves image: SKU image -> door-style image -> drawing fallback
- [ ] Admin: per-SKU "Edit/Replace photo" with in-browser crop/rotate/zoom editor (faster than prepping files)
- [ ] Admin: batch image uploader, auto-match files by SKU code / cabinet+style / plain names; report unmatched
- [ ] S3 upload via storagePut; standardize/auto-fit images on save
- [ ] Repeatable distributor import (alias + category auto-resolve) reused by onboarding
- [ ] vitest for image-match resolver + SKU image fallback
- [ ] Editor "Apply to" scope: default = ALL of this cabinet (same masterCode across every door style + distributor); options = this SKU only / this door style. Confirm count before applying.

## Door styles = master category leader (site-wide)
- [ ] Hierarchy everywhere: Door Style -> Category -> Sub-category -> Cabinet
- [ ] Shopper picks door style FIRST, then browses cabinets within that one style (no flat cross-style cabinet lists, no cross-family mixing)
- [ ] Editor "Apply to all B21" is a CHECKBOX, default ON; off = this SKU only
- [ ] Self-paced: edit any time, saves as you go
- [ ] Audit storefront/nav/family/design tool/admin for door-first compliance

## Design Tool Fixes (2020-inspired usability)
- [x] Multi-wall elevation: ElevationView receives wall={activeWall}; all 4 walls viewable (see Phase 25)
- [x] Show which wall the elevation is displaying (label) + wall switcher in Front View (in-panel WALL Back/Left/Front/Right switcher added in Phase 25)
- [x] Cabinet picker grouped/sorted by height (sticky "42″ HIGH"/"35″ HIGH" headers) — verified rendering in browser

## Design Tool — heights, line sizing & conflict status (user request)
- [x] Add real `height` to PlacedCabinet; capture on placement + package load
- [x] Fix elevationBox() so wall cabinets render at true height, hung from the 84" top line
- [x] Show full W×H×D size on every build-sheet/order line item (UI panel + CSV export)
- [x] Detect appliance-in-cabinet collisions, mark as "Conflict" status (red on canvas + badge on line + warn before export)
- [x] Vitest coverage for height resolution + conflict detection
- [x] Island and the cabinets on it should move together when the island is dragged
- [x] Build-sheet PRICING panel: consolidate identical cabinets (code+size) into one line with visible ×qty + line total
- [x] Consolidated build-sheet line: delete control removes the item from the design (decrement qty when >1)
- [x] Door swing: hinge side (Left/Right) per door cabinet — DoorSwing model + Swing toolbar toggle (see Phase 25)
- [x] Door swing: L/R indicator on plan AND elevation; Swing column on build-sheet/order lines (Phase 25)
- [x] Door swing: Vitest coverage for swing default + toggle (7 cases added in Phase 25)
- [ ] (backlog) Email + password admin login for 7809tom@gmail.com (scope TBD with user)
- [x] Add a visible "Corner Wall" category/tab in the Design Tool cabinet picker (group diagonal/corner wall cabinets) — verified rendering (duplicate of below)
- [x] Add "Wall by Ht" and "Corner Wall" tabs to Design Tool cabinet picker
- [x] Diagonal corner wall cabinet draws as a 45-degree triangle (not L-shape/rectangle)
- [x] Diagonal corner cabinet footprint = square bounding box (~24" each wall) via footprintDepth() (see Phase 25; 4 vitest cases)
- [ ] Appliance Garage in Faircrest door style does not reflect correctly (investigate data/availability) — BLOCKED: no "Faircrest" style in DB / AG2418 not in catalog; awaiting catalog data from Rich

## Design Tool — session (round 3)
- [x] Door swing (Left/Right hinge) helpers + data model
- [x] Swing toolbar button + 'S' shortcut on selected cabinet
- [x] Swing shown on consolidated panel line + canvas hinge marker
- [x] Swing column in exported build-sheet CSV
- [x] Diagonal corner wall: 12"+12"+45° pentagon footprint
- [x] Angled wall (AW) / appliance garage (AG) share diagonal footprint
- [x] Corner Wall + Wall-by-Height picker tabs
- [x] Wall cabinets allowed on island (move with island)
- [ ] AG2418 appliance garage not in catalog — needs catalog data (awaiting list)
- [ ] No "Faircrest" door style in DB — confirm intended style name
- [x] Click to set a (wall) cabinet to ground level / floor — shipped as right-click + "Drop to floor (island base)" (dropToFloor handler; top lands at 34.5")
- [ ] Email + password login + admin (7809tom@gmail.com) — pending scope confirm

## Design Tool — blind corner rule
- [x] Blind corner base sits on floor (base height) — elevationBox base bottom=0
- [x] Blind corner requires a 3" filler on the blind side (auto-marked) — blindCornerFillers + blindCornerAutoFiller
- [x] Adjacent perpendicular cabinet must be pulled 3" off the corner — blindCornerViolations / pull spec
- [x] Flag a conflict when the 3" pull/filler is missing — conflict banner + missing-spec conflict
- [x] Show filler + violation on canvas and in BOM/export warning — hatched filler marker + BOM filler line
- [x] Vitest coverage for the blind corner rule (design.test.ts)

## Closet Designer (v1 framework) + Blind corner rule
- [x] Blind corner rule: flag conflict if adjacent cabinet not pulled 3" off the corner (description-driven detection)
- [x] Closet parts catalog (placeholder products + prices) in client/src/lib/closet.ts
- [x] Kitchen/Closet room-type toggle in Design Tool; closet palette grouped by category
- [x] Closet parts priced via unitPriceFor (id=0, skipped by cabinet pricing engine)
- [x] Closet parts flow through canvas/build-sheet/W×H×D pipeline
- [x] Vitest coverage for closet catalog + blind corner rule (351 tests pass)
- [ ] Replace placeholder closet parts with user's real closet product list + trade pricing (awaiting list)
- [ ] (Backlog) Email/password admin login alongside Manus OAuth (awaiting scope confirmation)
- [ ] (Backlog) Add DWP + AG2418 + other items from user's list once provided


## Email/password login (alongside Manus OAuth)
- [ ] Add passwordHash + email (unique) columns to user table; generate + apply migration
- [ ] DB helpers: getUserByEmail, createEmailUser, setPasswordHash
- [ ] Auth procedures: emailSignup, emailLogin, emailLogout (bcrypt hashing, issues same session cookie)
- [ ] Rate limiting / lockout on login attempts
- [ ] Promote 7809tom@gmail.com to admin on signup with that email
- [ ] Login/Signup UI alongside Manus sign-in (toggle)
- [ ] Vitest coverage for signup/login/wrong-password/lockout

## Email / Password Auth
- [x] Schema: emailLower (unique), passwordHash, failedLoginAttempts, lockedUntil on users
- [x] DB helpers: getUserByEmailLower, createEmailUser (auto-admin for owner email), recordLoginResult, setPasswordHash
- [x] emailAuth router (signup/login/logout) issuing same JWT session cookie as OAuth
- [x] Lockout: 5 failed attempts -> 15 min lock
- [x] Mount emailAuthRouter in server/routers.ts
- [x] SignIn page (/signin) with tabbed Sign In / Create Account + "Continue with Manus"
- [x] TopNav Sign In buttons route to /signin (desktop + mobile)
- [x] Vitest coverage for email auth logic + logout (9 tests)

## Fix: "Sign In does nothing"
- [x] Root cause: post-login redirect + TopNav Account button pointed at /account, which had no route (landed on 404 catch-all)
- [x] Build Account page (/account): name/email/role, admin shortcut, Open Design Tool, Sign Out; redirects to /signin when logged out
- [x] Register /account route in App.tsx
- [x] Verified full signup -> session -> /account flow in browser; removed throwaway test user

## Feature: BAM Batten Molding in Design Tool
- [x] Corrected BAM catalog description + dimensions (3/4" x 3/16" x 96") to match spec image
- [x] Added battenLinearInches() seam-based run helper + unit tests in design.ts
- [x] Added "Batten" toggle to Design Tool toolbar (orders in 96" sticks)
- [x] Added BATTEN MOLDING (BAM) line to the BOM / build sheet
- [x] Render slim vertical batten strip at cabinet seams in Front View (ElevationView)


## Catalog images + molding fixes (2026-06-22)
- [x] Pool 4 x 20/20 catalogs, extract product line-art (1224 images)
- [x] Match catalog images to 359/388 master codes (override map for stragglers)
- [x] Upload 299 unique images to webdev static storage
- [x] Add cabinets.catalogImageUrl column + populate (359 rows)
- [x] Expose catalogImageUrl via catalog + design tRPC procedures
- [x] CabinetImage wrapper (img with onError -> CabinetDrawing fallback)
- [x] Wire into Catalog, CabinetDetail, Family, DesignTool palette
- [x] Verify rendering via screenshots (family/IB, /catalog/B-24, /catalog)
- [x] Fix flagged molding/filler dims from catalog (F-3/6-42/96, FBM, LRM-8, ALRM-8, VA-48)
- [x] Reclassify FS-24/FS-30 as Floating Shelf (2-3/16"H x 12"D)
- [ ] PENDING new catalogs: CBT (Corner Base Trim) + plain LRM 1-1/4" (not in current 4 catalogs)
- [ ] PENDING US Cabinet Depot + Faircrest 20/20 catalogs to fill 29 unmatched images


## Design canvas line-art (20/20 feel) (2026-06-22)
- [x] Carry catalogImageUrl through placed cabinets (palette add + package preload + packages.layout API)
- [x] Show catalog line-art thumbnail of the SELECTED cabinet in the Selected bar (img + drawing fallback)
- [x] Decision: keep plan as top-down footprint + elevation as colored door-style front (perspective line-art would misread there); line-art lives on palette + selected-item preview
- [x] Added ?view=front/split default-view param for deep-linking elevation
- [x] Verify in browser (plan + elevation screenshots), tests 365 pass, typecheck clean

- [x] Mobile UX: design canvas now usable on phones — full-bleed canvas + bottom toolbar + drawers (see below)


## Mobile designer + tape-measure room entry (2026-06-23)
- [x] Tape-measure room entry: RoomSizeControl now takes a single tape-measure field per wall (Back/Front/Left/Right) that builds the room to scale
- [x] Parse feet/inches + fractions (e.g. 10' 6", 126", 120 1/2", 10 ft 6 in, decimals) into inches — parseLengthToInches in design.ts + 6 vitest cases (server/parseLength.test.ts)
- [x] Mobile layout: full-bleed canvas on phones with a fixed bottom toolbar (Catalog · Front/Bird's-Eye view toggle · Rotate · Delete · Cart w/ item badge)
- [x] Catalog/cabinet picker as its own mobile drawer (left Sheet) — reuses the exact desktop palette JSX via PaletteShell wrapper (no duplication)
- [x] Cart/BOM + pricing as its own mobile drawer (bottom Sheet) — reuses desktop pricing JSX via PricingShell wrapper
- [x] Desktop toolbar tool toggles (Measure/Island/Crown/Toe Kick/Batten/Countertop/Swing) collapse into a mobile "More" dropdown; desktop layout untouched at md+
- [x] Keep desktop layout intact (responsive, mobile-first additions only) — side columns are hidden md:flex; mobile renders same content in Sheets
- [x] Verify on phone (390x844) plan + catalog drawer + cart drawer + desktop; 371 tests pass; typecheck clean; checkpoint


## Social sign-in + launch readiness (2026-06-23)
- [x] Surface prominent "Continue with Google" / "Continue with Apple" (+ Microsoft) buttons on SignIn page, routing through the Manus OAuth portal (Option A: no new credentials)
- [x] Keep email/password + a generic "More sign-in options" path; social buttons visually prioritized
- [x] Pass a provider hint to the portal (provider + loginMethod params) so the right provider is preselected
- [ ] Diagnose published-site OAuth callback error (exchange_failed) — BLOCKED: needs the live published origin; getLoginUrl already uses window.location.origin so the redirectUri will match once published/DNS-connected. Re-test after publish.
- [x] Ensure callback + getLoginUrl use the current origin so it works on cabinetdeals.com once DNS is connected (redirectUri = window.location.origin)
- [x] Vitest for login-url builder (provider hint + redirectUri) — client/src/lib/loginUrl.test.ts (3 cases)
- [ ] Report exact Publish + Settings→Domains DNS steps for cabinetdeals.com


## Phase 14: Social Sign-In, Mobile Designer & OAuth Hardening (this session)
- [x] Catalog line-art images: matched 359/388 cabinet codes, uploaded 299 images, added cabinets.catalogImageUrl (migration 0012), wired into Catalog/Detail/Family/Design palette with drawing fallback
- [x] Molding/filler spec fixes (F-3/6-42/96 fillers, FBM, LRM-8, ALRM-8, VA-48; FS-24/FS-30 reclassified as Floating Shelves)
- [x] Mobile Kitchen Designer: full-bleed canvas + fixed bottom toolbar (Catalog/View/Rotate/Delete/Cart) + Sheet drawers (PaletteShell/PricingShell); desktop layout untouched at md+
- [x] Tape-measure room entry: parseLengthToInches() (feet/inches/fractions) + RoomSizeControl rewrite + 6 vitest cases
- [x] getLoginUrl() accepts optional LoginProvider hint, passes provider/loginMethod params to Manus OAuth portal
- [x] SignIn page: Google/Apple/Microsoft social buttons (brand SVG glyphs) + "More sign-in options" fallback; email/password tabs retained
- [x] Fixed stale DesignTool.tsx Vite parse error (verified clean parse via Babel + tsc; dev server restarted)
- [x] OAuth callback hardening: logs decoded attemptedRedirectUri + host on exchange_failed for live-domain diagnosis; graceful redirect retained
- [x] 371 tests passing, typecheck clean
- [ ] PENDING (waiting on Rich): US Cabinet Depot + Faircrest 20/20 catalogs to fill 29 unmatched cabinet images + confirm CBT & plain LRM specs
- [ ] PENDING (launch): bind cabinetdeals.com in Settings → Domains, publish, then verify OAuth callback on the live domain


## Phase 15: Mobile Design Tool layout bug (reported by user)
- [x] Phone shows cramped 3-column desktop layout instead of single-column mobile UI — raised designer breakpoint to 1024px (useIsMobile(1024)) and switched shells/toolbar/canvas from md: to lg: so phone/tablet/desktop-site widths always get the mobile UI
- [x] Make the top toolbar collapse on mobile — desktop action cluster now hidden below lg, compact More menu shown instead
- [x] Verified at 390px, 720px, and 1280px; 371 tests pass; checkpoint saved


## Phase 15c: Door Styles page — feature Skyline first + profile filters (user request)
- [x] Pin Skyline (Aero) door styles to the top as Featured row (interim: name-prefix match), ahead of the full grid
- [x] Profile filter buttons already present up top (All Styles / Shaker / Slim Shaker / Double Shaker / Raised Panel / Slab, etc.)
- [x] Verified storefront featured row renders (owner screenshot)

## Phase 15d: Admin-controlled Featured Door Styles (user request — 80/20 merchandising)
- [x] Add isFeatured (bool) + featuredRank (int) to door_styles schema; migration 0013 generated + applied
- [x] adminProcedure set/unset (setFeatured) + reorder (reorderFeatured) + listForAdmin; public featured query (cap 30, rank order)
- [x] Admin UI: Featured Styles tab (FeaturedStylesAdmin) toggle + order, MAX 30 enforced (server cap + input guard)
- [x] Storefront Featured row reads admin selection, capped at 30, ordered by featuredRank (seeded Skyline/Aero default)
- [x] Verified storefront + admin render (owner screenshot); 375 tests pass incl. new featuredStyles.test.ts (4 tests)

## Phase 15b: CRITICAL — Door style click skips color/style selection (user report)
- [x] Added doorStyles.siblings query (color variations within same door profile, current first, deduped)
- [x] Family page now has a "Choose your finish" swatch row (color-accurate, current ringed gold) — pick the COLOR in place; cabinets recolor; each swatch links to that color's family
- [x] Verified on real Aero Blanc family (/family/SDW): 5 finish swatches render; siblings.test.ts (3 tests) pass

## Phase 16b: CRITICAL — Designer loses everything when leaving the screen (user report)
- [x] Auto-persist full working design to localStorage (key cabinet-dealz:designer-draft:v1:<email>), debounced ~400ms on every change
- [x] Immediate save on visibilitychange(hidden) + pagehide + beforeunload — catches incoming phone call / OS tab eviction
- [x] Restore on mount (after verification, skipped when ?package= present); shows "Restored your in-progress design" toast
- [x] "Start new design" item in More menu clears canvas + draft (with confirm)
- [x] Verified in browser: placed DB-12-3, fired visibilitychange, reloaded, re-entered email -> design restored; 378 tests pass

## Phase 16: Lock floor plan / walls (user request)
- [x] Global "Lock Layout" toggle in toolbar: freezes room resize + wall drag + opening/island move while still allowing cabinet add/move (toast confirms)
- [x] Per-wall lock: each wall has a padlock toggle; locked walls show a padlock badge + "<wall> — locked" label and can't be dragged
- [x] Draw Room + room-size editing disabled when locked; lock state shown on canvas
- [x] Wired lock state into PlanCanvas wall/opening/island handlers + drawMode commit guard; lock state persisted in draft
- [x] Verified in browser (global + per-wall locked states render, walls frozen); 378 tests pass


## Phase 17: Restore missing Faircrest pantry cabinets (user report)
- [x] Audited catalog (2026-06-23): 24 tall cabinets ALL present + active — ovens (O-*), microwave (MO-*), and the full utility/pantry range U-18/24/30 at 84/90/96" (9 SKUs). 0 rows contain the word "pantry" (active OR inactive); 9 "utility" cabinets. No deleted/inactive pantry rows exist.
- [x] Cross-check: there is NO "Faircrest" distributor (Line A/B/C only) and NO Faircrest door style in the DB. The missing items are specific to the Faircrest line, which was never imported.
- [ ] BLOCKED — needs the Faircrest source catalog/spreadsheet from Rich to import the line (distributor + door styles + SKUs/pricing). Cannot fabricate SKUs or prices. The platform's generic pantry/utility cabinets (U-series) are intact and usable in the meantime.
- [ ] (After import) Verify they appear in catalog + designer; run tests; checkpoint

## Phase 18: Chat bubble overlaps mobile designer toolbar (user report)
- [x] Located: ChatWidget rendered at App level (client/src/App.tsx)
- [x] Hidden on /design at <1024px (isDesignerTouch) AND when the in-designer consultant panel is open, so it never covers the Delete/Cart toolbar
- [x] Desktop chat unaffected (launcher still shows at lg+)

## Phase 19: Auto-Design — mark wall span (A to B) -> auto-fill layout (user request)
- [x] UX: "Auto-Fill Wall" toolbar button fills the active (highlighted) wall; breaks the run around door/window openings via freeSegmentsOnWall
- [x] Deterministic closet auto-fill rules (closet FillMode candidates; falls back to base/tall when no closet parts) sized to the span
- [x] Deterministic kitchen auto-fill rules (varied base run + fillers + range/oven clearance filler) sized to the span
- [x] Generated cabinets placed as normal movable/deletable items via wallPlacementAt; respects layoutLocked
- [x] Vitest coverage (autofill.test.ts + shared/fillEngine.test.ts): span coverage, no overlap/overflow, valid catalog widths, varied mix, clearance filler

## Phase 20: AI design-consultant chat mode (user request)
- [x] Designer chat panel acts as a design consultant (DUP of Phase 21): slide-in Design Consultant panel
- [x] Consultant uses marked wall measurements + catalog (same family/distributor) as constraints (server consult input: walls + styleId/distributorId)
- [x] AI returns a structured layout placed on the canvas + plain-language summary (applyConsultPlan)
- [x] Validates against catalog: LLM picks strategy only; deterministic fillEngine emits real SKUs (impossible to invent a code/size)
- [x] Vitest: server/design.consult.test.ts (reply+plan, closet fallback, empty-wall reject) + fillEngine determinism

## Phase 18b: Closet mode is too restrictive — allow cabinets + doors in closets (user report)
- [x] Root cause: the "Door/Win" + cabinet tabs render only when roomType===kitchen, so closets can ONLY place closet parts; user got stuck switching modes to add a door
- [x] In Closet mode, show ALL palette tabs: closet parts PLUS base/wall/tall cabinets and the Door/Win opening tool
- [x] Closet/Kitchen toggle just sets starting catalog + pricing context; switching keeps everything placed (cabinets, closet parts, openings)
- [x] Verify in browser: in Closet mode add a door (Entry Door 36" placed); tabs all present; switching keeps items

## Phase 18c: Adjustable doors & windows (user request)
- [x] Let a placed door/window be resized (width along wall; height for windows/openings where sensible)
- [x] Add a simple size control (drag handle and/or numeric width input) when an opening is selected
- [x] OpeningSizeEditor: numeric Width for all; Height + Sill for windows; clamped to wall length; verified on canvas (DOOR 36->48)
- [x] Clamp to the wall length (clampOpening + wallLength in OpeningSizeEditor; clampOpeningsToRoom on room resize); new size reflected in plan + elevation (openings drive freeSegments + viewOpenings)
- [x] Persist adjusted size in the auto-saved draft (openings in snapshot deps + restored via d.openings)

## Phase 19: Live drag tape-measure (20/20-style) (user request)
- [x] While dragging a cabinet, show live dimension lines + numbers on BOTH sides along the wall at once: left edge -> previous obstacle (neighbor cabinet edge or wall) AND right edge -> next obstacle (neighbor or wall) — wallSpanMeasure() helper + dragTape overlay in PlanCanvas
- [x] Both numbers update live as you drag (inches, with feet-inches readout); measure to nearest neighbor if present else the wall
- [x] Readout updates in real time and respects snapping; hides on drop
- [x] 4 vitest cases for wallSpanMeasure pass (90 design tests green)

## Phase 20: Deterministic wall-span auto-fill engine (user request) — DONE (see "Phase 20 (done)" + Phase 24)
- [x] Tested module autofill.ts (wraps shared/fillEngine.ts): tiles real cabinets to standard widths + fillers
- [x] "Auto-Fill Wall" control fills the active wall, breaking around openings
- [x] Placed items use wallPlacementAt geometry; movable/deletable; respects Lock Layout
- [x] Closet + kitchen rules (candidatesForMode); closet falls back to base/tall when no closet parts
- [x] Vitest covering fill math (sums to span, valid codes) — autofill.test.ts + fillEngine.test.ts

## Phase 21: AI design-consultant chat (user request)
- [x] Chat consultant panel (Design Consultant button + slide-in AIChatBox) interprets a described layout + marked wall measurements and proposes a plan
- [x] AI selects strategy only; shared deterministic fillEngine places real catalog parts (no hallucinated SKUs/sizes) — verified via API: closet+kitchen both fill 96" wall exactly (B-48+B-48), leftover 0
- [x] Uses catalog + door styles + distributor families + project rules; layout-only (no personal/financial data)
- [x] Proposed layout applied to canvas via applyConsultPlan using nextFreeSpotOnWall; fully editable
- [x] Server tests (design.consult.test.ts, 5 cases) + deterministic fallback for build requests; 104 tests green
- [x] Fix: styleId/distributorId now nullish (was 400 when no door style selected)
- [x] Fix: closet pool excludes accessory fronts/"display"/"door & drawer front"; requires real base/tall storage units
- [x] Fix: hide global chat bubble while consultant panel open (no overlap)
- [x] Polish: varied/mixed fills (planVariedWidths) + break run around door openings (freeSegmentsOnWall) — shipped in Phase 24

## Phase 19b: New cabinets drop in room center, not the corner (user request)
- [x] When adding a cabinet from the palette, place it at the center of the room (unattached) instead of snapping to the active wall's corner — verified in browser (fresh B-36 dropped centered)
- [x] User can then drag it; existing wall snapping still applies when dragged near a wall (snapPosition on drag)
- [x] Live tape measure works from the center position too


## Phase 20 (done): Deterministic wall-span auto-fill engine
- [x] autofill.ts engine: greedy widest-first tiling to a wall span + filler for small leftover (10 vitest cases pass)
- [x] candidatesForMode excludes corners/panels/fillers/appliances; kitchen=base, closet=closet parts or base/tall fallback
- [x] "Auto-Fill Wall" toolbar button (Wand2) fills the highlighted active wall, packing past existing cabinets/openings
- [x] Placed items use nextFreeSpotOnWall geometry; fully movable/deletable; respects Lock Layout
- [x] Browser verify: Auto-Fill Back wall -> toast "Auto-filled Back wall: 2 cabinets", B-48 + DB-24-2 packed flush past existing B-24; BOM updated 2->4 items
- [ ] Polish (later): break the run around a door opening's actual position instead of just subtracting its width

## Phase 22: Visible countertop + colors/materials + sink & faucet (user request)
- [x] Countertop renders as an actual surface over base cabinets in PLAN view (slab overlay) — verified in browser
- [x] Countertop color/material picker (White/Black Granite/Marble/Butcher Block/Concrete/Sand Quartz) recolors the rendered surface — verified (switched to Black Granite)
- [x] Place a SINK into the countertop (basin) + a FAUCET indicator; 4 sink presets — verified (Bar/Prep + Double Bowl added, faucet toggle)
- [x] Persist countertop material + sinks in the auto-saved draft (snapshot + restore + autosave deps)
- [x] Vitest for countertopSurfaces/material/makeSink (96 design tests green); browser verify
- [x] FRONT/elevation view countertop band: thin colored slab drawn on top of the base run at the 36" counter line, colored by the selected material (ElevationView countertopMaterialId)
- [x] Show countertop material + sinks on BOM/quote line items: COUNTERTOP line now names the material; SINK line lists basins + faucets; both flow into the exported CSV

## Phase 23 (later): Cabinet hardware (knobs/pulls)
- [ ] Hardware catalog (knobs, bar pulls, cup pulls) selectable per door/drawer or globally
- [ ] Render hardware on cabinet fronts in elevation; show on BOM

## Phase 24: Smart fillers + range/oven corner rule + appliance/closet sizing (user request)
- [x] Varied auto-fill layouts: planVariedWidths mixes standard widths (e.g. 96"->36+30+24) instead of repeating the widest; tests added
- [x] Break the cabinet run around door/window openings: freeSegmentsOnWall + wallPlacementAt; Auto-Fill tiles each segment; tested
- [x] Intelligent filler placement: fillEngine inserts a real FILL-* SKU for 1.5–6" leftover gaps and absorbs sub-threshold leftovers as reveal (autofill.test.ts covers both)
- [x] Manual filler placement: "Filler" toolbar button + "Add filler…" in mobile More menu — prompts width (default 3", max 6"), drops a movable FILL-* item via makeFiller; respects Lock Layout; 3 new makeFiller vitest cases
- [x] Range/oven corner clearance rule: rangeOvenClearanceViolations validator + 3" filler; UI warning + one-click Add clearance filler; tested
- [x] Surface a design-check warning when a range/oven abuts a cabinet at a corner without clearance filler (red conflict banner + amber CTA button)
- [x] Dishwasher panel sizing: BDEP corrected to 3"W x 34.5"H x 24"D, DWR-3 dishwasher end panel 3"W x 34.5"H; panels render at 3/4" stock via isPanelItem
- [x] Closet/laundry program depth: closet program uses shallow CLOSET_PANEL_DEPTH=14" (16" variant), not 24" kitchen base depth (verified in closet.ts)
- [x] Run full test suite (441+ passing); added vitest for new engine behaviors; checkpoint saved
- [x] Vanity cabinets 21" deep (fixed BFH-27/30/33/36 from 24"->21", VDEP->21"; ADA + V-* already 21"); wall 12", kitchen base 24" confirmed correct
- [x] Wall cabinet elevation rule: all wall cabinets share the same TOP line (84"); a cabinet shorter than 30" hangs higher so its BOTTOM = 84 - height (12" -> 72"); tested
- [x] Glass stacker wall cabinets stack ON TOP of the wall cabinet below them (bottom at 84", growing UP to ceiling) via isStacker; tested
- [x] Base cabinets always start at 0" (elevation bottom = floor); box 34.5" tall, countertop top line at 36"; tested
- [x] Countertop is a post-layout step: Countertop action gated until base/island present (button + dropdown disabled, toast guidance, auto-off when base run removed); top generated over assembled base run via countertopArea
- [x] Wall cabinet mount height adjustable up/down (Raise/Lower/Reset controls); mountBottom override stored; elevation uses override when set; tested
- [x] Wall cabinets must stay >= 3" away from doors and windows: freeSegmentsOnWall openingClearance param pads each opening by 3"; wallOpeningClearanceViolations validator + conflict warning flag any wall cabinet within 3"; tested
- [x] Right-click a wall cabinet (or use the Drop to floor button) -> converts it to a floor-standing island/peninsula base, depth 24", bottom = 0 so its TOP lands at 34.5"
- [x] Blind corner pull spec: pullMin/pullMax carried onto placed cabinets; blindCornerSpecViolations flags out-of-range; admin Min/Max inputs in contextual row; tested
- [x] Blind corner filler enforced via existing blindCornerFillers/blindCornerViolations (filler + 3" pull on opposite side)
- [x] Blind corner with NO pullMin/pullMax spec -> missing-spec conflict + red banner message telling the administrator to enter the manufacturer min/max; tested
- [x] Countertop runs all the way to the wall over a pulled blind corner: countertopSurfaces widens the blind-corner base slab by the pull gap (default 3" filler, or pullMax travel) toward the corner; tested
- [x] Blind corner placement auto-snaps a 3" filler on the OPPOSITE (pull) side via blindCornerAutoFiller (projects full base depth into the corner); ambiguous corner -> no guess; tested
- [x] Skyline easy-reach corner base cabinets (ERB-33, ERB-36) flagged isCornerCabinet=1, subCategory='Easy Reach Corner Base' (BES-12 corrected back to Base End Shelf)
- [x] Safety rule: ambiguous corner/blind conditions (missing spec, undetermined pull side, no room for filler) leave the design in CONFLICT rather than guessing

## Phase 25: Backlog continuation (engineering-ready items)

- [x] Reconcile already-implemented duplicate backlog lines: verified in code — varied/mixed fills + break-around-openings live in shared/fillEngine.ts (planVariedWidths + forceFiller); intelligent filler + range/oven clearance filler in DesignTool; manual filler via makeFiller; blind-corner pull spec + auto-filler in design.ts
- [x] Diagonal corner cabinet footprint = square bounding box: footprintDepth() returns width-as-depth for isDiagonalCorner() cabinets (DCW/WDC/DCB/AW/AG + "diagonal"); pentagon clip-path renderer in plan; added 4 vitest cases
- [x] Multi-wall elevation: ElevationView already receives wall={activeWall}; added an in-panel WALL Back/Left/Front/Right switcher (onSelectWall) so you can flip walls from the elevation itself; wall label retained as fallback
- [x] Door swing hinge L/R: DoorSwing model + resolveSwing/cycleSwing/swingLabel/swingText; Swing toolbar button + (S) shortcut + dropdown; L/R marker on plan AND now on elevation door fronts; Swing column on build-sheet CSV + L/R hinge note in BOM; added 7 vitest cases (default/double/none/override/cycle/labels)
- [x] Mobile chat bubble: ChatWidget returns null on /design at <1024px (isDesignerTouch) and when the in-designer consultant panel is open, so it never covers the Delete/Cart toolbar; desktop chat unaffected


## Phase 26: Homeowner pricing competitor research (user request 2026-06-23 — "have homeowner price but please shop for pricing")
- [x] Pulled current homeowner prices + cost floor for a 10-item basket (scripts/price-basket.mjs)
- [x] Researched competitor RETAIL street prices across 8 sellers + Home Depot ceiling (scripts/price-research.md)
- [x] Computed market median per item; we run ~1.6-2.6x over market (scripts/price-reco.mjs)
- [x] Recommendation written: ~5% under median, floor = cost x1.7, holds 41-61% margin (HOMEOWNER_PRICING_RECOMMENDATION.md)
- [x] User approved Option A (2026-06-23) — applied in Phase 27

## Phase 27: Apply approved homeowner repricing (Option A, approved 2026-06-23)
- [x] Backed up all 10,643 rows (homeowner+adjustedList) to scripts/price-backup-<ts>.json + .sql (reversible restore UPDATEs)
- [x] Built category+width market-median model calibrated to the shopped data (scripts/apply-homeowner-pricing.mjs)
- [x] Applied: homeowner = max(round(median*0.95), round(cost*1.7)); adjustedListPrice (Compare-at) = old homeowner. 9,629 SKUs lowered, catalog homeowner value -33%
- [x] Verified: 0 below cost, avg margin 47.7%, min 41%, all 10,643 have Compare-at; the 2,224 'below 1.7x' are exact-1.70x rounded to whole dollars (not a real violation)
- [ ] NOTE: storefront CabinetDetail/DesignTool only expose Wholesale+Contractor tiers — homeowner price/Compare-at not yet surfaced to guests (needs homeowner-tier display decision; see Phase 28)

## Phase 28: Retail/affiliate storefront — surface homeowner pricing to guests (user request 2026-06-23)
- [ ] Audit pricing flow: pricing.stylesForCabinet + catalog/cart server fields (homeowner/adjusted/contractor/wholesale)
- [ ] Public default tier = Homeowner (retail) for guests; show Compare-at (adjustedListPrice) strike-through
- [ ] Logged-in pros see their assigned tier (Contractor/Wholesale) instead of retail
- [ ] Wire homeowner price through catalog cards, CabinetDetail, Add-to-Cart unit price, cart totals
- [ ] Tests for tier resolution (guest->homeowner, pro->assigned) + typecheck; verify in browser; checkpoint

## Phase 29: Save designs + attach to CRM (user request 2026-06-23)
- [ ] Ensure designs are saved with a NAME (saveDesign already takes name) and listable
- [ ] CRM deal: "Linked Designs" section with a drop-down of saved designs (by name) to attach
- [ ] Persist deal<->design link (new table or column); show linked design name on the deal
- [ ] Confirm scope: all my designs vs filtered to the deal's customer (asked user)
- [ ] Tests + verify; checkpoint

## Phase 30: BUG - drawer base cabinets missing from Design Tool palette (user report 2026-06-23)
- [ ] Reproduce: drawer base (DB-*) cabinets not appearing in the Design Tool cabinet picker
- [ ] Determine if catalog has DB-* drawer bases (and whether tied to a style like Skyline)
- [ ] Check the Design Tool palette query/filter for why drawer bases are excluded
- [ ] Fix so drawer bases appear in the palette; verify in browser
- [ ] Tests + checkpoint

## Phase 31: REVERSED DECISION - cabinet availability is per-door-style, NOT shared across a supply line (user clarification 2026-06-23)
- [x] Owner clarified: each door style (e.g., Aspen White) has its OWN set of available cabinets; do NOT force a line's full catalog into every style.
- [x] Design Tool behavior (styleId-gated placeableCabinets/familyCatalog) is CORRECT — keep as-is.
- [x] Backfill approach ABANDONED. A live run of backfill-style-skus.mjs had already inserted 4,549 rows; reverted precisely via revert-backfill-style-skus.mjs using the inserted-platformSku list. distributor_skus restored to 10,643 rows.
- [x] Confirmed NO "Skyline" style exists in catalog (separate note)

## Phase 31b: Make storefront Catalog reflect per-style availability (so a cabinet only shows when its door style is selected)
- [x] Added server cabinets.listForStyle (style-gated published+available SKUs, category/search/pagination)
- [x] Catalog category view now requires a door style (selector + "Select a door style to begin" prompt) before any cabinets show; ?style= deep-link preselects
- [x] Catalog cabinet grid scoped to selected style's published+available SKUs (matches Design Tool); cards carry ?style= into detail
- [x] Replaced misleading "every cabinet is available in each finish" copy with per-style wording
- [x] Verified in browser (Dual Blanc shows only its base lineup); typecheck clean
- [x] Ran full vitest (463 passed) + typecheck clean
- [x] Verified CabinetDetail pricing: guests/homeowners see retail (homeowner) PriceCard with Compare-at; pros see tier tabs; cart uses resolved tier price via priceNumberForTier
