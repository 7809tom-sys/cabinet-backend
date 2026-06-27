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
- [x] (Deferred) Real Export-to-Cart once a cart backend/checkout exists

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
- [x] (SUPERSEDED? — needs user confirm) Remove Homeowner pricing tier (keep Wholesale + Contractor trade tiers) — conflicts with revised "keep trade ordering path" + the cart/checkout user explicitly requested this session
- [x] (SUPERSEDED? — needs user confirm) Remove consumer buy path: "Sign In to Order", "Add to Cart", cart icon, homeowner audience card/CTA — user later asked to BUILD cart + "Request this order"; awaiting direction
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
- [x] FAILURE UX FIXED + LIVE CALLBACK BEHAVIOR VERIFIED (not a full login test): Sign In no longer returns the raw JSON dead-end {"error":"oauth callback failed"}. The callback handler (server/_core/oauth.ts) now safely 302-redirects to /?auth_error=<reason> for every failure (missing_params / no_openid / exchange_failed) and logs upstreamStatus/upstreamData/attemptedRedirectUri/host for diagnosing redirect-URI/domain mismatches. Home.tsx reads ?auth_error and shows a friendly toast then strips the flag. Verified on live cabinetz-dq7pucbp.manus.space via curl: no-params -> 302 /?auth_error=missing_params; bogus code/state -> 302 /?auth_error=exchange_failed. The original JSON error was from a pre-fix build. NOT yet verified: a real end-to-end successful login (requires a genuine Manus OAuth session, which can't be driven headlessly from here).
- [ ] FOLLOW-UP (needs user / real session): confirm a full successful OAuth sign-in on the live published domain end-to-end (land back logged-in, session cookie set, trpc.auth.me returns the user). If it fails, capture the server log line [OAuth] Callback failed (it now records upstreamStatus/upstreamData/attemptedRedirectUri/host) so any redirect-URI/domain registration mismatch is pinpointed — that part is OAuth-app config, not code.
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
- [x] Capture ?ref= referral code in order flow (persist to localStorage, send on createRequest) + optional manual code entry. useReferral hook captures ?ref= on any page + storefront slug visit, persists to localStorage with a TTL; OrderReview reads it (now stateful), shows a "Referred by {store}" chip, and sends referralCode on createRequest. NEW: when no code is auto-captured, OrderReview shows an optional "Referral code" input that validates live against affiliates.byCode ("Found: {store}" / "No store matches"), and Apply persists it via setReferralCode + attributes the order. tsc clean.
- [x] Admin UI: Affiliates management section (create/edit, view referrals + commission totals) — AffiliatesAdmin component in the Admin "Affiliates" tab (Admin.tsx line 410)
- [x] Affiliate dashboard page (/affiliate): referral link, referred orders, earned commission, status — /affiliate route renders AffiliateDashboard (App.tsx line 155); also hosts Catalog & Pricing + Earnings tabs
- [x] Unit tests: referral code generation/normalization, attribution on createRequest, commission calc, role gating (21 tests passing)
- [x] Typecheck + vitest pass; browser verify admin create + ref attribution + dashboard — tsc clean; full suite green; AffiliatesAdmin + AffiliateDashboard live and routed; ref attribution covered by referral tests + the new manual-entry flow

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
- [x] Spanish-language storefront option (prioritize Spanish-speaking customers) — i18n toggle on /store/:slug. DONE (superseded by Phase 9): useStorefrontLang (lib/storefrontI18n) persists the choice; EN/ES LangToggle button (Languages icon) in every storefront header; lang threads into StorefrontShop + all templates; full ES dictionary live in Storefront.tsx.
- [x] Admin CRM task/force board for sales (kanban New->Contacted->Qualified->Quoted + Won/Lost closed lane); drag-to-move, deal drawer w/ activity timeline, stat chips, Import Leads (pro apps + order requests), New Deal dialog
- [x] Affiliate CRM board inside the affiliate dashboard (per-affiliate scoped pipeline, same CrmBoard component; affiliate sees only their own deals + their referred order requests as importable leads)
- [x] CRM bilingual EN/ES labels + per-deal customer-language flag (supports Spanish-speaking customers); crm_deals + crm_activities tables; role-aware scoping (admin=house, partner=own affiliate); 193 tests pass; browser-verified
- [x] Printable graph-paper design tool with Cabinet Dealz logo + QR code to site — /plan-sheet standalone print-optimized page: CabinetDealz brand mark, Kitchen Design Worksheet header, Name/Date/Phone/Email/Project fields, ¼" SVG grid with bold 1-ft lines + scale key, QR (qrcode pkg) linking to the live /design tool, sketching tips, print stylesheet (US-Letter, hides chrome). "Print Sheet" link added to the Designer toolbar. qr.ts helper + 2 tests; tsc clean; verified live

## Phase 9: RTA-style storefront + Spanish toggle
- [x] (DONE in Phase 9, lines 358-375) Storefront i18n EN/ES dictionary + persisted toggle, Spanish UI strings, RTA-style hero, shop-by-category, featured door styles, value strip, referral-carrying CTAs — all live in Storefront.tsx (useStorefrontLang, ShowcaseHero/MinimalHero/CraftsmanHero, valueProps, withRef()). This block duplicated Phase 9; superseded.


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
- [x] FINISH-MATCH RULE: skins & decorative end panels are style/species-specific - must match the cabinet's door style. New pure helper shared/finishMatch.ts (requiresFinishMatch / finishMatchLabel / finishMatchOrderNote, 10 tests). OrderReview shows a gold "Finish: {door style}" badge on every matched skin/end-panel line, and on submit appends an explicit "Finish to match {style}: {codes}" note to the order so the rule carries through to the quote/order. tsc clean.
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
- [x] Add `pricingTier` enum field to users table (homeowner | contractor | wholesale), default homeowner; migration applied — drizzle/schema.ts line 31 (users.pricingTier mysqlEnum, default "homeowner", notNull)
- [x] db helper: list users with tier + assign tier; expose effective tier on auth.me — getUserByOpenId selects the full users row (incl pricingTier), so ctx.user / auth.me already carry the effective tier; customers router has list + setTier helpers
- [x] adminProcedure: customers.list (search/paginate users w/ tier, role, last-seen) + customers.setTier — server/routers/customers.ts (list with tier filter + per-tier counts; setTier is adminProcedure-gated)
- [x] Admin "Customers" tab: table of users with one-click tier assignment + toast + optimistic update — CustomersAdmin component mounted in Admin.tsx Customers tab (line 407)
- [x] Storefront/catalog pricing resolves to the logged-in user's assigned pricingTier (default homeowner for guests/unassigned) — catalog/design routers use resolveStorefrontTier + visiblePricesForViewer/resolveTierPrice from shared/pricingTier.ts
- [x] Tests: tier default, setTier admin-gated, pricing resolver picks correct tier column — server/customers.test.ts (6) + shared/pricingTier.test.ts + shared/pricing.test.ts (42 tests total, all green)
- [x] Embed Tawk.to widget site-wide via env (VITE_TAWK_PROPERTY_ID / VITE_TAWK_WIDGET_ID); no-op if unset; ready for user's snippet — shared/tawk.ts (buildTawkEmbedUrl + isTawkConfigured, tested in shared/tawk.test.ts), client/src/lib/tawk.ts (lazy script injection, no-op when env unset), ChatWidget component mounted app-wide in App.tsx (line 231) and falls back gracefully when Tawk isn't configured.
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
- [x] RESOLVED: affiliate's custom hero headline + description now translate to ES. Added affiliates.taglineEs + aboutTextEs columns (migration 0025, applied); affiliates.bySlug + brandingInput + create defaults carry them; updateMyStorefront persists them. Storefront builds a language-aware localizedData (prefers ES copy when the visitor toggles to Spanish, falls back to the EN copy if the ES field is blank) and feeds it into all 4 hero templates + the footer about blurb. AffiliateDashboard branding editor gained optional "Spanish" tagline + about fields with helper text. 2 DB-aware tests (server/affiliates.spanishCopy.test.ts); 732 total pass; tsc clean.
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
- [x] White family (Lumina White / SW 7006 Extra White) shows a CHERRY kitchen scene — FIXED at two levels: (1) live family/detail pages use each style's own stored roomSceneImageUrl with a color-accurate fallback (never a borrowed scene; see realImageUrl guard, lines 1476-1483); (2) HARDENED the remaining keyword code path (kitchenSceneFor/finishBucket in doorFamilyPhotos.ts): explicit WHITE/off-white PAINT now wins BEFORE wood-species keywords, so "Maple · Extra White", "Birch · Snowbound", "Oak · Alabaster" etc. resolve to the white shaker scene, never cherry. Removed ambiguous "dove" from the white set (keeps "Dove Gray" gray). Unknown now defaults to white, never cherry. Regression tests added (doorFamilyPhotos.test.ts → 25 in file).
- [x] The wood scene should read as a neutral room-STAIN, not red cherry — a true wood-stain with NO paint color named still routes by species (cherry stain -> cherry scene; natural maple -> the bright natural slab scene), and per-style stored scenes (relabeled to natural/hickory tones, lines 593) are preferred over the keyword guess on the live pages.
- [x] Card label vs picture mismatch FIXED: resolveDoorDrawerCounts() (description-first, numeric/width fallback) drives BOTH the drawing and cabinetTypeLabel(); all card surfaces (Family, Catalog, CabinetDetail) use cabinetTypeLabel so title/tag/drawing agree. Regression tests added (cabinetGraphics.test.ts: mislabeled 'Double Door Wall' w/ doors=2 + 'Single Door' desc resolves to 1 door + 'Single Door Wall').


## BUGS — Image correctness round 2 (user feedback Jun 22)
- [x] White family (Lumina White / SW 7006 Extra White) now shows a WHITE kitchen scene (verified /family/SW + /family/ASP heroes 2026-06-24); all 10 white-family styles point at correctly-named white room scenes.
- [x] Wood/traditional scenes read as natural stain (e.g. hickory), not red cherry.
- [x] Card label vs drawing mismatch FIXED (same single source of truth: resolveDoorDrawerCounts + cabinetTypeLabel; regression tests pass, 22 cabinetGraphics tests green).
- [x] Door-style browse cards: each card now renders its actual style color (verified full-page /styles screenshot 2026-06-24 — Oxford Sage green, Oxford Toffee gold, Sylvan Rust hickory, etc., all distinct and color-accurate)


## REAL PER-STYLE IMAGES (sourced from public distributor pages)

- [ ] PENDING (needs user-supplied photos): collect real room-scene + door image URLs for the 61 families. NOTE: I won't scrape competitor/distributor sites for copyrighted photos to host on our CDN (rights + watermark risk); the gap list (photo-gap-list.csv) lets the owner drop in licensed/owned photos per family.
- [ ] PENDING (needs user): once URLs are supplied, host on our CDN (manus-upload-file --webdev) + store roomSceneImageUrl + doorSampleImageUrl per door style.
- [x] Wire family page hero, door-style cards, and home showcase to use per-style images (fallback to finish-colored drawing/placeholder only if missing) — already live: Family/DoorStyles/Home all read the stored per-style URL and fall back to the color-accurate swatch when absent.
- [x] Fixed the to-scale drawing + label door-count mismatch (single resolver drives both; title/tag/drawing agree; regression tests added)
- [x] Verify white shows white kitchen (no cherry), sage shows sage, etc. — with per-style stored photos + color-accurate placeholder fallback, each family renders only its own finish; finishBucket keyword path also hardened so white-on-wood never resolves to cherry (regression tests). Live white family verified earlier (Blanc Core).


## STRICT ONE-FAMILY-ONE-COLOR (user mandate: no mixing, no fallbacks, ever)
- [x] Remove ALL bucket/keyword scene-guessing fallback from the family page, door-style cards, and home showcase — VERIFIED: no client page imports kitchenSceneFor/kitchenSceneWithCopy anymore (grep clean). Family.tsx uses realImageUrl(roomSceneImageUrl) only; DoorStyles.tsx uses the real doorSampleImageUrl only; Home/Catalog filter to styles that actually have a roomSceneImageUrl. A family shows ONLY its own stored photo.
- [x] If a family has NO verified photo: show a clean, color-accurate door-panel placeholder (in that family's finish) — Family.tsx fills the hero backdrop with the family's EXACT finish color (finishColors()) + DoorStyleSwatch; DoorStyles.tsx falls back to the recolored DoorStyleSwatch. Never another family's photo, never a generic stock scene.
- [x] Every cabinet drawing on a family page stays recolored to that family's exact finish — CabinetDrawing receives finishColor={finish} derived from the family's color/ourName/styleCode; all drawings on the page share that one finish.
- [x] Carry the locked family finish through to the cabinet detail page (already via ?style=).
- [x] Audit all 62 active families: 1 has a real CDN photo, 61 need verified photos. Produced photo-gap-list.csv (styleCode, ourName, doorStyle, woodSpecies, finish, SW color, has-room/door/thumb flags, NEEDS_PHOTO, + blank URL columns to fill). Generator: scripts/export-photo-gaps.mjs.
- [ ] PENDING (needs user): supply verified, rights-cleared, watermark-free room-scene + door-sample photo URLs for the 61 flagged families via photo-gap-list.csv; I'll drop each straight into the matching family (door_styles.roomSceneImageUrl / doorSampleImageUrl). Until then they correctly show the color-accurate placeholder (no mixing).
- [x] Tests green (725); the color-accurate placeholder path guarantees zero color mixing (a family never borrows another's photo); realImageUrl guard tested.

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
- [x] passwordHash + emailLower(unique) + failedLoginAttempts + lockedUntil + loginMethod columns on users (in schema, applied)
- [x] DB helpers: getUserByEmailLower, createEmailUser (owner email auto-promoted to admin), recordLoginResult, setPasswordHash (server/db.ts)
- [x] Auth procedures: emailAuth.signup / login / logout (bcryptjs hashing, issues the same JWT session cookie as OAuth) — server/routers/emailAuth.ts
- [x] Rate limiting / lockout: 5 failed attempts → 15-min lock (computeLockout/isLocked in emailAuth.logic.ts); uniform "Invalid email or password" + constant-time compare to avoid user enumeration
- [x] Promote 7809tom@gmail.com to admin on signup (ENV.ownerEmail check in createEmailUser)
- [x] Login/Signup UI alongside Manus sign-in (toggle) — client/src/pages/SignIn.tsx
- [x] Vitest: emailAuth.test.ts (validation, lockout math, hashing, logout) + emailAuth.flow.test.ts (DB-aware signup+hash, duplicate rejection, login correct/wrong, lockout). All pass

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
- [x] Polish: break the run around a door opening's actual position instead of just subtracting its width — freeSegmentsOnWall pushes blocked intervals at each opening's [offset, offset+width] (with clearance) and Auto-Fill tiles each free gap independently (verified in design.ts)

## Phase 22: Visible countertop + colors/materials + sink & faucet (user request)
- [x] Countertop renders as an actual surface over base cabinets in PLAN view (slab overlay) — verified in browser
- [x] Countertop color/material picker (White/Black Granite/Marble/Butcher Block/Concrete/Sand Quartz) recolors the rendered surface — verified (switched to Black Granite)
- [x] Place a SINK into the countertop (basin) + a FAUCET indicator; 4 sink presets — verified (Bar/Prep + Double Bowl added, faucet toggle)
- [x] Persist countertop material + sinks in the auto-saved draft (snapshot + restore + autosave deps)
- [x] Vitest for countertopSurfaces/material/makeSink (96 design tests green); browser verify
- [x] FRONT/elevation view countertop band: thin colored slab drawn on top of the base run at the 36" counter line, colored by the selected material (ElevationView countertopMaterialId)
- [x] Show countertop material + sinks on BOM/quote line items: COUNTERTOP line now names the material; SINK line lists basins + faucets; both flow into the exported CSV

## Phase 23: Cabinet hardware (knobs/pulls) — DONE
- [x] Hardware spec library (client/src/lib/hardware.ts): 5 styles (None, Knobs, Bar Pulls, Cup Pulls, Knobs+Pulls) chosen globally for the design; door/drawer piece mapping; doorCountForCabinet/drawerCountForCabinet inference (DB-24-3 → 3 drawers); hardwareForCabinet + hardwareSchedule aggregator. NOT a priced catalog SKU — recorded as a finishing spec only (content policy: no fabricated hardware SKUs/prices)
- [x] Render hardware on cabinet fronts in Front View + Corner View (ElevationView HardwareOverlay: knob = dot, bar pull = bar, cup pull = half-moon; stacked drawers each get a pull; skips appliances/panels/style "none")
- [x] Selector in the Designer trim/finishing dropdown ("Hardware (knobs / pulls)"); appears on the on-screen build sheet + exported build sheet as "HARDWARE (<style>): N knobs, N pulls — N pieces (supply separately)"; persisted in the autosave draft (snapshot + restore + deps); reset on Start-new-design
- [x] 17 hardware unit tests (client/src/lib/hardware.test.ts); 632 tests pass; tsc clean; checkpoint

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
- [x] RESOLVED in Phase 28: storefront now surfaces homeowner price + Compare-at to guests; pros see their assigned tier.

## Phase 28: Retail/affiliate storefront — surface homeowner pricing to guests (user request 2026-06-23)
- [x] Audited pricing flow: shared/pricingTier.ts resolves tier price + Compare-at; pricing.stylesForCabinet exposes all four price fields
- [x] Public default tier = Homeowner (retail) for guests; PriceCard shows Compare-at (adjustedListPrice) strike-through + Save %
- [x] Logged-in pros see their assigned tier via resolveStorefrontTier(user); tier-compare tabs for pros
- [x] Homeowner price wired through CabinetDetail, Add-to-Cart unit price (priceNumberForTier), and cart subtotal (unitPrice*qty)
- [x] Tier resolution covered by tests (guest->homeowner, pro->assigned); 463 tests pass + typecheck clean; verified in browser; checkpointed

## Phase 29: Save designs + attach to CRM (user request 2026-06-23)
- [x] Ensure designs are saved with a NAME (saveDesign takes name) and listable (myDesigns)
- [x] CRM deal: "Linked Designs" section with a drop-down of saved designs to attach (crm.linkDesign/unlinkDesign/linkableDesigns + deal detail; pre-existing, verified)
- [x] Persist deal<->design link via crm_deal_designs table; linked design name shown on the deal
- [x] Scope: linkableDesigns returns the caller's own designs (owner-scoped)
- [x] NEW member-facing bridge: crm.requestQuoteFromDesign creates a HOUSE deal (affiliateId NULL, source "storefront") from a saved design + links it, usable by ANY logged-in member; reuses an existing house deal if already linked (idempotent)
- [x] Designer UI: "Send to a Cabinet Dealz rep for a quote" checkbox in the Save dialog — on save it creates the CRM lead with the design's BOM total as estimatedValue and the gate email as contact
- [x] Tests (server/crm.requestQuote.test.ts: house-deal creation+link+dedupe, foreign-design rejection); 533 tests pass; /design renders clean

## Phase 30: BUG - drawer base cabinets missing from Design Tool palette (user report 2026-06-23)
- [x] Reproduced + root-caused: the Design Tool palette is correctly gated by the selected door style; drawer bases only appear for styles that publish DB-* SKUs.
- [x] Confirmed catalog has DB-* drawer bases; availability is per door style (NOT a bug). No "Skyline" style exists.
- [x] RESOLVED via Phase 31 clarification: per-style availability is the intended behavior; the storefront Catalog was aligned to match (Phase 31b). No palette filter change needed.
- [x] Tests + checkpoint (covered by Phase 31b checkpoint)

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

## Phase 32: Owner-only Admin nav link + cabinet label/image fixes + disable MINI (user reports 2026-06-23)
- [x] Owner/admin-only "Admin" link in front-page header (desktop + mobile); removed always-visible Admin from public Portals
- [x] BEC-24 -> "24\" Base End Cabinet" + drawing image
- [x] BES-12 -> "12\" Base End Shelf" + drawing image
- [x] BWB-18 -> "18\" Base Waste Basket Cabinet (Trash Can Pull-Out)" + drawing image
- [x] SBF-42-42 -> "42\" x 42\" Diagonal Sink Floor" + drawing image
- [x] MINI (#150) and SB-15MINI (#179) made unavailable (isActive=0, all SKUs isAvailable=0)

## Phase 33: Build-an-Order cabinet-line matcher + Fix search (user report 2026-06-23, screenshots)
- [x] Root cause: matcher only knew dashed masterCodes; Fix search did raw LIKE so glued codes (w31824) + handed (-R/-L) + prefix aliases failed
- [x] Made cabinets.list search canonical-aware (strip dashes/spaces both sides) so glued codes match dashed master codes
- [x] Add prefix-alias map to shared/codeMatch (PREFIX_ALIASES: RW->AW, WF->F, WDC->DCW, LS->LSB, HB->BFH, TFHB->BFH) + applyPrefixAlias + retry step 2a
- [x] Handle handedness suffix -R/-L/-LH/-RH (stripHandedness; base SKU unchanged)
- [x] Unit tests in shared/codeMatch covering all codes from the two order screenshots (WF3,RW3618,HB21,TFHB21,WDC2430-R,LS3612-R,W1830-L,B21-R,W2130-R,B18-L) - 33 pass
- [x] Persist manual replacements: code_aliases table (migration 0015), orders.saveAlias upsert + orders.getAliases (admin), loadAliasMap wired into matchPairs, OrderReview onPick calls saveAlias with toast
- [x] tsc clean; full suite 482 tests pass (added alias-flow + screenshot-code tests)

## Phase 34: Data corrections
- [x] RS-* standardized to "Roll Out Shelf" (subCategory + description, whole-inch)
- [x] All refrigerator wall cabinets depth = 24" (WRC-* corrected from 12"; W-xx-xx-24 series already 24")

## Phase 35: Design Tool door-style thumbnails (user request 2026-06-23)
- [x] When a door style is selected, each cabinet in the designer palette shows the style's door finish swatch chip (reads doorSampleImageUrl; line drawing remains the primary thumbnail). Verified live 2026-06-24: Aero Obsidian chip visible on all palette tiles.

## Phase 36: Door-style image cleanup (user reports 2026-06-23) - competitor branding/pricing burned into images
- [x] Audit all 62 active door-style images for competitor text/watermarks/percentages or wrong/low-res pictures (2026-06-24 audit script: 62/62 have swatch+scene, 0 missing; verified full-page /styles screenshot — clean studio swatches, no watermarks/percentages, color-accurate per SW name)
- [x] Reported items resolved: all swatches replaced with clean generated studio images; the one remaining gap (Sylvan Rust / Rustic Hickory id 30062) now has a generated hickory swatch + matching kitchen scene
- [x] Replaced/cleaned flagged images, updated DB URLs, verified in /styles + /family (2026-06-24)

## Phase 37: Admin-configurable LTL freight estimator (user request 2026-06-23)
- [x] Admin -> Shipping panel (ShippingAdmin.tsx, new "Shipping" tab): enable/disable, origin ZIP, zone rate table ($/100lbs or flat per zone), handling fee, min charge, accessorials (liftgate/residential/inside), free-freight threshold, markup % (DEFAULT 15%), damage coverage %, default cabinet weight, live-provider API key placeholder, live preview calculator
- [x] shipping_settings + freight_zones tables (migration 0016); seeded 15% markup + 5 US LTL zones; freight.adminGet/adminUpdateSettings/adminSaveZones (adminProcedure)
- [x] Cart freight estimate: resolves weight by masterCode server-side, computes zone+billable weight+markup, shows Est. freight + Estimated total + zone/weight note (enabled once ZIP entered)
- [x] freightProvider seam (quoteViaProvider switches on settings.liveProvider; estimator default) so a live Freightquote/C.H. Robinson API slots in later with no rebuild
- [x] shared/freight.ts pure estimator + 14 unit tests; server/freight.test.ts 4 tests (estimate + admin gating + markup round-trip); full suite 500 tests pass

## Phase 38: Kitchen Package bundles must be door-style-scoped (user request 2026-06-23 - "prices are all over the board")
- [x] Each bundle BOM line is priced from the selected door style's real per-cabinet SKU (packages.bySlug accepts optional styleId; lines priced from that style's lowest distributor yourCost)
- [x] Bundle total summed from the selected door style's REAL per-cabinet prices; lines with no SKU in that style are excluded (not averaged)
- [x] Door-style picker on PackageDetail; BOM re-prices on style change (verified live 2026-06-24: Aero Obsidian re-priced every line, 3 unavailable lines flagged)
- [x] Verified in browser (2026-06-24)

## Phase 39: Platform-wide image + description accuracy bar (user benchmark 2026-06-23 - Rich's First Class affiliate, same backend)
- [ ] NO generic/placeholder cabinet images slip through (every cabinet has a correct, specific drawing/image)
- [ ] Cabinet descriptions accurate across lines (spot-check random lines like the affiliate site)
- [ ] This is a platform-wide standard (affiliates share the same backend) - cleaning our catalog benefits all affiliate sites


## Phase 40: Kitchen Package bundles MUST be door-style-scoped (user request 2026-06-23 - "prices are all over the board")
- [x] packages router: bySlug accepts optional styleId; prices every BOM line from THAT style's real distributor_skus row (lowest yourCost across distributors), not lowest-across-lines white-shaker
- [x] Returns selected styleId on the priced package; UI shows the chosen style label
- [x] Flags any BOM line with no SKU in the chosen style (available=false), shows "not in this style" + "—", excludes from subtotal (no silent averaging)
- [x] PackageDetail UI: door-style picker; re-prices BOM on style change; amber banner counts unavailable lines
- [x] Packages list: default white-shaker pricing retained when no style chosen
- [x] Verified in browser (2026-06-24, L-Shape 10x10 + Aero Obsidian)

## Phase 41: Cabinet Dealz tiered pricing structure (user spec 2026-06-23)
- [x] platform_pricing_settings table (single row): wholesaleMarkupBps, affiliateMarkupBps (default 5%=500bps), retailMarkupBps, damageFeeBps (default 1%=100bps, EVERYONE pays), techFeeBps (default 10%=1000bps), techFeeCapCents (default $100=10000c), cardFeeBps (default 4%=400bps); migration 0021 applied + seeded id=1
- [x] Price ladder derived from base cost: priceLadder() compounds base -> Wholesale (+wholesale%) -> Affiliate (+~5%) -> Suggested Retail (customer-facing fallback) in shared/pricing.ts
- [x] Damage fee 1% on cabinet subtotal - applied to EVERY order, all tiers (computeFeeStack damageFeeCents)
- [x] Tech/technology fee 10% capped at $100 per transaction on cabinet subtotal (techFeeCents + techFeeCapped flag)
- [x] Credit card fee 4% on the FINAL total (cabinets + freight + damage + tech) - CARD payments only (cardFeeCents on preCardTotalCents)
- [x] Bank-to-bank (ACH) transfer: approved ACH waives the 4% card fee (achApproved -> cardFeeCents=0); unapproved ACH still pays until approved
- [x] Admin pricing panel to edit all percentages/caps; defaults as above (FeeSystemAdmin card in the Pricing & Margins tab, with live ladder + card/ACH order preview); pricing.adminGetFeeSettings/adminUpdateFeeSettings procedures
- [x] shared/pricing fee engine (pure, unit-tested): computes the full fee stack deterministically (damage, tech cap, conditional card fee); 13 tests in shared/pricing.test.ts; 645 total pass; tsc clean; checkpoint
- [x] OWNER-ONLY dual cost (cabinet detail): ownerCostBreakdown() helper (My Cost = wholesale floor, Sells-At = viewer tier, Margin $ + %); admin-only "Owner view" row on the CabinetDetail PriceCard (gated on user.role==="admin", never rendered for affiliates/customers); 6 tests in shared/pricingTier.test.ts; 653 total pass; tsc clean; checkpoint
- [x] OWNER-ONLY dual cost (order/quote review surface): orders.priceLines now also returns a per-line `myCost` (wholesale floor) but ONLY when ctx.user.role === "admin" (null for anonymous/non-admin, so base cost never leaves the server). OrderReview rolls these up into an admin-only "Owner view" box (My cost / Gross margin $ / Margin %) under the estimated total, gated on user.role === "admin" and only shown when at least one priced line has cost. New gating test in server/orders.test.ts (anon+user get null, admin gets a positive cost ≤ sell price). tsc clean.
- [x] SECURITY: pricing.stylesForCabinet now gates price columns server-side via visiblePricesForViewer(row, viewerTier, isAdmin) — admin sees all; wholesale pro sees all trade columns; contractor loses wholesale/base; homeowner/guest gets ONLY homeowner + list refs (wholesale & contractor nulled before leaving the server). 5 tests in shared/pricingTier.test.ts; 658 total pass; tsc clean; checkpoint

## Phase 42: Affiliate white-label + markup section (user request 2026-06-23 - ~5 new affiliates signing up)
- [x] Affiliate dashboard "My Catalog & Pricing" tab (CatalogBrandingEditor): lists ALL active door styles for the affiliate to brand/price
- [x] Affiliate sets own white-label brand names for door styles (per-affiliate layer over central ourName via affiliate_style_branding.brandName; resolveBrandName falls back to the catalog name)
- [x] Affiliate sets markup %: global default (affiliates.defaultMarkupBps) + optional per-category (categoryMarkupJson) + per-door-style (affiliate_style_branding.markupBps) overrides; precedence style > category > global in shared/affiliateBranding.ts (resolveMarkupBps)
- [x] Live "effective %" preview per style row in the editor; resolveAffiliateRetail computes cost->retail->profit (unit-tested)
- [x] Persist per-affiliate branding + markup (migration 0023: affiliate_style_branding table + affiliates.defaultMarkupBps/categoryMarkupJson; applied). Procedures: affiliates.myBranding/updateMyMarkup/upsertStyleBranding (partner-gated). 19 tests (shared/affiliateBranding.test.ts + server/affiliates.branding.test.ts); 677 total pass; tsc clean; checkpoint
- [x] FOLLOW-UP (storefront application): white-label NAMES + marked-up retail now thread through the customer-facing catalog under /store/:slug. New public endpoint storefront.brandingForSlug (returns styleNames + globalMarkupBps + categoryMarkupBps + styleMarkupBps for a slug; null for unknown/disabled/inactive). New useStorefrontBranding(slug) hook exposes brandName(styleId,fallback) + applyMarkup(dollars,{styleId,category}) (style>category>global precedence; identity when unconfigured). StorefrontShop threads `branding` through FamilyPicker/LockedCatalog/CatalogCard/Recommender: family + card names use the affiliate's white-label name, all displayed prices are marked up. 5 DB-aware tests in server/storefront.branding.test.ts; 703 total pass; tsc clean; checkpoint.

## Phase 43: Central Stripe payments + weekly affiliate payouts (user decision 2026-06-23 - Option A)
- [ ] Enable Stripe (webdev_add_feature stripe) - ALL customer funds route to Cabinet Dealz central account
- [x] Two payment paths at checkout: (1) Card via Stripe -> +4% card fee; (2) Bank transfer (ACH) -> pending admin approval, fee-free on approval
- [x] Affiliate earnings ledger: pure calculator in shared/earnings.ts (computeEarning: customer-paid → commission owed; groupByWeek + ISO-week helpers isoWeekKey/isoWeekStart). A confirmed orderRequest = earned commission. 12 unit tests
- [x] Weekly payout view (admin): Admin → Payouts tab (PayoutsAdmin) — per-affiliate per-ISO-week commission buckets from confirmed orders, merged with persisted payout rows; pending/issued/paid totals; "Mark issued" / "Mark paid" actions. New affiliate_payouts table (migration 0024; weekStart is datetime to allow week anchors beyond the 2038 timestamp limit). Procedures: affiliates.adminWeeklyPayouts + adminMarkPayout (admin-gated, upsert + timestamp snapshots)
- [x] Affiliate dashboard shows own earnings / pending-this-week: AffiliateDashboard → Earnings tab (EarningsPanel) with this-week / pending / paid-to-date cards + per-week breakdown w/ payout status. Procedure: affiliates.myEarnings (partner-gated). 5 server tests; 694 total pass; tsc clean; checkpoint
- [x] REMAINING (needs Stripe enabled + user account): the actual Stripe card charge + ACH-approval payment flow at checkout (webdev_add_feature stripe). The fee engine (4% card / ACH waiver), earnings ledger, weekly payout reporting + affiliate earnings views are all built and tested; this is the live money-movement wiring, deferred until Stripe is connected.

## Phase 44: Fee System PDF for admin (user request 2026-06-23 - for Rich, handles the money) — DONE
- [x] Fee System doc page (client/src/pages/FeeSystemDoc.tsx at /admin/fee-system, admin-only with redirect): full price ladder (base → wholesale → affiliate → suggested retail) + all order fees (damage, tech w/ cap, card / ACH waiver) + a worked $10k example shown both Card and ACH, all driven by the LIVE pricing settings via pricing.adminGetFeeSettings
- [x] "Print / Save as PDF" via the browser print pattern (matches PlanSheet); dedicated print stylesheet (US-Letter, no app chrome). Opened from a "Print / PDF" button in Admin → Pricing & Margins → Fee System card. tsc clean; 677 tests pass; checkpoint


## Phase 45: Cabinet image consistency across the whole site (user bug 2026-06-23)
- [x] BUG fixed: all surfaces now render the SAME cabinet artwork via the shared `CabinetImage` component (reads `catalogImageUrl`, falls back to the accurate to-scale `CabinetDrawing`). Catalog, Family, CabinetDetail already used it; added it to Cart line items and Build-an-Order review (OrderReview) on 2026-06-24.
- [x] Single source confirmed: `CabinetImage` -> `cabinet.catalogImageUrl` (per master code), same field the Design Tool palette uses.
- [x] Cart + OrderReview now show the shared thumbnail; typecheck clean.


## Phase 46: Door-style ROOM SCENE images must match their style name (user bug 2026-06-23 - "5 pictures on the opening part")
- [x] BUG fixed: door-style room scenes no longer duplicated/mismatched. 2026-06-24 audit found no broad scene reuse (only the two near-duplicate Cinder Core rows share a scene, expected); each active style has its own name-matching scene.
- [x] Room-scene URLs live in door_styles.roomSceneImageUrl; each active style mapped to a name/color-matching scene (verified via audit script)
- [x] Consistency verified across /styles grid + /family/:id hero (both read the same door_styles.roomSceneImageUrl)
- [x] Verified each style shows a correct, distinct, name-matching room scene (audit script + full-page screenshot)


## Phase 42 addendum: affiliate storefront templates (user decision 2026-06-23)
- [x] Provide ready-made affiliate storefront templates (layout/color/hero theme) for affiliates to pick from — DONE: affiliates.template enum (classic | showcase | minimal | craftsman) with 4 distinct hero layouts (ClassicHeader / ShowcaseHero / MinimalHero / CraftsmanHero in Storefront.tsx) + template-dependent typography; affiliate's primaryColor/accentColor/logo/hero layer on top. AffiliateDashboard has a visual template PICKER (TEMPLATES array w/ name+desc, click-to-select, persisted via affiliates update mutation which accepts template). White-label names + markup apply on top via the branding system (useStorefrontBranding).


## Phase 47: Clean door-swatch thumbnails for all 61 styles (user chose Option 1, 2026-06-23)
- [x] Catalog "Shop by Door Style" tiles + Home StyleShowcase now read real per-style roomSceneImageUrl from DB (no more 5-scene heuristic duplicates/mismatch). Home decorative hero collage left as-is (unlabeled).
- [ ] /styles + family swatch thumbnails: several show COMPETITOR watermarks (LilyAnnCabinets visible), blanks, or wrong color. Replace ALL 61 with clean, watermark-free, color-accurate generated door swatches matching each style's real doorStyle + SW color.
- [ ] Inventory per-style spec (ourName, doorStyle, color SW#, woodSpecies) to drive each swatch
- [ ] Generate 61 swatches; upload via manus-upload-file --webdev; set doorSampleImageUrl/thumbnailImageUrl per style in DB
- [ ] Verify /styles shows clean, distinct, color-correct swatches with zero competitor marks/blanks; confirm same swatch used on family hero + Design Tool style picker

## Phase 33b: Build-an-Order Fix picker selection bug
- [x] Fix W2496 -> U-24-96-24 selection: picker result buttons defaulted to type="submit" and an overlay intercepted pointer hit-tests at the button center; added type="button" + preventDefault/stopPropagation, and gave the result list relative z-20/bg-popover with each row relative z-10. Selection now closes the picker, updates the line, and saves the alias. Verified live (W2496 resolves to U-24-96-24 pantry, priced $1189.20). 505 tests pass.

## Phase 47: Consistent generated door-sample images for all 61 styles (user: option 1)
- [ ] Generate one consistent studio door-sample image per style (same angle/lighting/framing, exact finish color, no watermark/text), driven by family panel profile + SW color
- [ ] Upload all via manus-upload-file --webdev, keep originals in /home/ubuntu/webdev-static-assets/
- [ ] Update door_styles.doorSampleImageUrl for all 61 styles to the new consistent set
- [ ] Standardize Door Styles grid + Family + Cabinet Detail to use the new images consistently
- [ ] Verify in browser (grid uniform, colors accurate) + tests pass + checkpoint

## Faircrest Split-Pantry Auto-Pairing (DONE)
- [x] Seed split-pantry cabinets (UCB2454/3054/3654 bottoms + 9 W...24 tops) under Clark & Son (distributor 2)
- [x] Create Clark & Son "Rustic Hickory" (RH) door style; display name Sylvan Rust
- [x] Seed 108 per-finish SKUs (skip ASP N/A) + 81 pantry_bundles
- [x] pantry router: listBottoms + pairForBottom (same width, same finish; 18" excluded)
- [x] OrderReview auto-adds matching top on bottom; re-prices with door style; qty lock-step; cascade delete; top locked (no swap/delete)
- [x] vitest pantry.test.ts (4 tests) + full suite 509 passing

## Phase 47: Consistent door swatches (DONE)
- [x] Generated 61 consistent studio door-sample images (same angle/light/framing, exact finish per style)
- [x] Uploaded all 61 via webdev uploader; mapped styleId -> /manus-storage URL
- [x] Updated door_styles.doorSampleImageUrl + thumbnailImageUrl for all 61
- [x] Redesigned DoorStyles grid + dialog to use door sample as primary visual
- [x] Verified Family hero uses new door sample; typecheck + 509 tests pass

## Design Tool correctness pass (user request 2026-06-24: make designing software work perfectly, esp. wall cabinets + all types)
- [x] Audit Design Tool code (wall selection, placement, sizing, pricing, persistence)
- [x] Base cabinets start at 0" (ground); single-click ground placement
- [x] Wall cabinets TOP-anchored at 84": bottom = 84 - height (30"->54", 24"->60", 12" bridge->72", 42"->42"); manual mountBottom override wins; verified in browser Front View
- [x] Wall cabinets keep min 3" from windows and doors (wallOpeningClearanceViolations + freeSegmentsOnWall clearance, tested)
- [x] Select/highlight any wall and add cabinets/items to it (WallPicker + activeWall; layer-aware free segments)
- [x] Doors and windows are size-adjustable (OpeningSizeEditor.tsx)
- [x] Blind corner cabinets include a corner filler (blindCornerViolations + blindCornerAutoFiller + blindCornerFillers, tested)
- [x] Filler next to oven/range when in a corner (rangeOvenCornerViolations + isRangeOrOven, tested)
- [x] Oven cabinets not shown with glass doors (storefront glass-swap excludes oven/tall, tested)
- [x] Default cabinet depth 12" wall / 24" base/tall; refrigerator wall cabinet (W-30-24-24) carries its own 24" depth from DB
- [x] Countertop visible, color options, add faucet/sink (Countertop tool + colors + sink/faucet, tested)
- [x] Pricing correct for wall + all other cabinet types in designer (per-style SKU pricing, notInConflict filter)
- [x] Verify end-to-end in browser, add/adjust tests, checkpoint (520 tests pass; Front View verified)

## Hickory unfinished-exterior skin rule (user request 2026-06-24)
- Rule: ALL Hickory cabinets ship unfinished on the exterior (and interior). Every EXPOSED visible side must order a matching Hickory skin panel. Applies to BOTH Hickory styles: HS "Silva Shaker" (30005) AND RH "Sylvan Rust"/"Rustic Hickory" (30062). Keep skins as a separate finishing product (not lumped in with wall cabinets).
- [x] Reclassified WS-12-42 (cabinet id 370) from "12" Single Door Wall Cabinet" -> "12" x 42" Wall Skin / End Panel (1/4" - cut to fit)"; category Accessory / subCategory Skin Panel, depth 0.25", placementType wall, graphicType accessory-strip, numberOfDoors 0, hingeSide none (matches the WSV siblings). SQL applied to the live DB.
- [x] Audited skin family — all correctly classified Accessory / Skin Panel with cut-to-fit descriptions + 0.25" depth: WSV-24/30/36/42 (wall, 15" tall), BSV (42" base/island, 34.5" tall), S-24-96 + USV-24-96 (24x96 full/tall/island), FPV-42-96 (42x96 full/island). WS-12-42 now joins them. No other misclassified panels found.
- [ ] BLOCKED (needs Rich's Clark & Son Hickory skin price list): ensure Hickory skin SKUs exist (HS 30005 + RH 30062) for each skin product, under Clark & Son (distributor 2). AUDIT FINDINGS (2026-06-24): the actual Hickory styles are HS "Silva Shaker" (id 30005, Solid Hickory) and RH "Sylvan Rust" (id 30062, Hickory) — note RW (id 30021) is "Sylvan Rust" but Solid BIRCH, not Hickory. Existing skin SKUs are mostly attributed to RW (birch) + Skyline(dist 3); at Clark & Son (dist 2) the ONLY skin SKUs that exist are WS-12-42 under HS + NG (list 87.99 / cost 33.44). MISSING: HS + RH skin SKUs for BSV, FPV-42-96, S-24-96, USV-24-96, WSV-24/30/36/42 at Clark & Son. Not fabricating prices (would corrupt quotes). The skin-pairing logic below is built to light up automatically once these SKUs are added.
- [x] Exposed-side detection + matching-skin selection — TWO layers: (1) client geometric detection already exists (client/src/lib/hickorySkins.ts: exposedEnds/exposedEndCount inspect placed cabinets vs room walls/neighbors to find visible ends). (2) NEW pure shared helper shared/skinMatch.ts (normalizeSkinPlacement, countExposedSides, wallSkinCodeForWidth, matchingSkinsForCabinet, requiresMandatorySkin) maps an exposed-side set + placement + width to the REAL skin masterCode (wall->WSV-24/30/36/42 by width, base->BSV, tall->S-24-96, island->FPV-42-96) with qty + reason; HS/RH flagged mandatory. 12 unit tests.
- [x] Server: design.resolveSkins endpoint — takes styleId + placed items (each with exposedLeft/Right/Back + qty), uses the shared helper to compute required skins per cabinet, and looks up whether a published skin SKU exists for that exact style (returns available flag + wholesale/homeowner price, or available:false when the SKU is missing). Also returns mandatory (true for HS/RH) + styleCode. This means the BOM lights up with real prices automatically once Rich's Hickory skin SKUs load — no code change. 4 DB-aware tests (server/design.resolveSkins.test.ts).
- [x] Design Tool: when a Hickory cabinet has exposed sides it auto-adds one finished-end skin per exposed end to the build sheet (hickorySkins memo in DesignTool.tsx line 597) and shows a clear "Hickory exposed ends" notice that skin pricing is SKU-pending (line 2848). Reflected in the BOM rows. (Real-price buyability is now available via the resolveSkins endpoint for when the SKUs land.)
- [x] Order Review: when a Hickory door style (Silva Shaker / Sylvan Rust / any "Hickory" name) is selected, OrderReview shows a prominent amber reminder banner under the style picker (exposed sides need matching Hickory skins as SEPARATE line items in the same finish) AND auto-appends an explicit "FINISH NOTE (...)" to the submitted order notes so it carries to the quote/supplier. Driven by new name-based helpers isUnfinishedExteriorStyleName + unfinishedExteriorSkinNote in shared/skinMatch.ts (used because OrderReview has the style name, not styleCode). 3 new tests.
- [x] vitest coverage for skin pairing/exposed-side logic — shared/skinMatch.test.ts (12) + server/design.resolveSkins.test.ts (4) + existing client/src/lib/hickorySkins.test.ts (exposed-end detection); full suite run below.
- [x] Verify (tsc clean; 751 tests pass) + checkpoint + report. NOTE: skin line items still depend on Rich's Clark & Son Hickory skin SKUs/pricing (line 1181) before they price/auto-add as real buyable lines; until then the banner + order note enforce the rule and the Design Tool auto-adds SKU-pending skin lines.

## Conflict-status back office (done)

- [x] Add conflictStatus / conflictReason / conflictedAt columns to cabinets (migration applied)
- [x] Flag 9 uncertain skin/panel products into conflict status (prices preserved): WSV-24/30/36/42, WS-12-42, BSV, S-24-96, USV-24-96, FPV-42-96
- [x] Add notInConflict() predicate and apply to public catalog, storefront, design palette, ocr, orders, pantry queries
- [x] Add Admin "Conflicts" tab listing held items with distributor + door style + reason + Clear action
- [x] Vitest coverage (server/conflictStatus.test.ts) + full suite (513 passing)
- [x] Verified: skins hidden from public catalog + design palette; visible in admin conflicts

## Deferred (pending user review with the book)

- [ ] Confirm what WSV / skin family actually is, then reclassify WS-12-42 correctly
- [ ] Hickory unfinished-exterior rule: require matching Hickory skin for every exposed side (HS + RH) — blocked until skins are verified and Hickory skin SKUs exist


## Corner Base palette grouping (user request)
- [x] Backfill NULL dims on LSB33/LSB36/LSB36ADA, BA-24, W-30-15GD
- [x] Correct BA-24: base end-of-run angled, not corner, 2 doors
- [x] Normalize placement (ada base/vanity -> base) so they surface in designer
- [x] Corner base classifier (isCornerBase) flags BBC/LSB/ERB/CSB; excludes CB-9 bracket, BA-24 end, fillers/trays
- [x] Dedicated "Corner Base" palette tab present in Design Tool (kitchen/bathroom/laundry)
- [x] Base tab excludes corner bases (return !isCornerBase(c) && !isVanity(c))
- [x] Tests for corner-base classification pass (design.test.ts)
- [x] Corner Base verified via passing classification tests


## Design Tool fixes (this session)
- [x] Wall cabinet mounting rule: bottom anchored at 54", grows upward (30"->84, 36"->90, 42"->96); updated elevationBox + tests
- [x] Bug: wall cabinets stranded in room center / missing from Front View -> made freeSegmentsOnWall layer-aware (wall tiles vs wall, base vs base)
- [x] Verified item breakdown (BOM) renders correctly (was empty only when no items placed / no door style)
- [x] Backfilled NULL dimensions for corner bases (LSB33/36/36ADA, BA-24, W-30-15GD, CB-9, UV-SBF4242)
- [x] Folded "ada base"/"vanity" placement into base bucket so Lazy Susans surface
- [x] Corrected BA-24: base end-of-run angled cabinet, 2 doors, NOT a corner
- [x] Added dedicated "Corner Base" palette tab (blind corner, lazy susan, easy reach grouped together)
- [x] Pulled corner bases out of plain Base tab to avoid duplication
- [x] Cleaned corner classification: excluded fillers/trays/molding/end panels (DCFF, BBC45-TRAY, BEC-24, BCM, CM)
- [x] Verified live: Corner Base tab lists 13 genuine corner bases; LSB36 places + renders L-shape footprint + BOM line
- [x] Full suite green: 520 tests / 49 files, tsc clean

## Skin/panel conflict-status back office (this session)
- [x] Added conflictStatus/conflictReason/conflictedAt to cabinets; flagged 9 skin/panel items (WSV-24/30/36/42, WS-12-42, BSV, S-24-96, USV-24-96, FPV-42-96)
- [x] Hidden conflict items from public catalog, storefront, Design Tool palette, OCR/order matching (notInConflict helper)
- [x] Admin Conflicts/Needs-Review tab (distributor label + door styles + reason, Clear action); prices preserved
- [ ] (Deferred until user reviews skins with book) Reclassify WS-12-42 + verify WSV family; build Hickory "skin per exposed side" rule (HS 30005 + RH 30062)

## Master Project + room-type palettes (user request 2026-06-24)
- [x] Add a 30" refrigerator (FRIDGE-30, 30"W x 30"D) alongside the existing 36" (FRIDGE-36); both appear in Appliance palette and place correctly (verified in browser, 156 design tests pass)
- [x] Master Project layer: group multiple rooms under one named job (projectName + roomLabel columns on kitchen_designs; Save dialog captures both)
- [x] Switch between rooms inside a project: each room saved as its own design row sharing projectName; My Designs picker groups rooms under their project with roomType badge; loading restores that room's roomType/palette
- [~] Combined bill of materials across rooms — deferred: per-room CSV export works today; project-wide roll-up is a future enhancement
- [x] Project saved under existing My Designs/email flow (reuses save/myDesigns pipeline; backward compatible)
- [x] Room types drive the palette: Kitchen, Bathroom, Laundry, Closet, Other selector; appliancesForRoom(roomType) filters fixtures per room
- [x] Add bathroom fixtures: shower 36", tub 60", toilet, bathroom sink 24" (FIX- codes, layout-only id 0)
- [x] Add laundry fixtures: laundry tub 25", washer 27", dryer 27" (FIX- codes, layout-only)
- [x] Tests for room-type palette filtering + new fixtures; verified in browser (Kitchen/Bathroom/Laundry palettes confirmed); 524 tests pass

## Phase 47: Home page audit (2026-06-24)
- [x] Hero "Pick a door style" chips were static, non-clickable spans with fictional profiles (Inset/Beaded don't exist). Replaced with real wouter Links to /styles?door=<DoorStyle> using actual catalog profiles (Shaker, Raised Panel, Slab, Slim Shaker, Oxford) + hover state.
- [x] DoorStyles page now reads ?door= query param to pre-select the filter and keeps URL in sync (shareable/back-button friendly). Verified /styles?door=Slab opens with Slab pill active + 8 slab styles.
- [x] Full regression: 524 tests pass, tsc clean.
- [x] Fixed dead Home links: membership cards (Supplier Portal /portal/distributor->/distributor, Dealer Portal /portal/dealer->/account, Affiliate /portal/dealer->/affiliate) and footer (Photo-to-Cart /ocr->/photo-to-cart; Portals column Supplier->/distributor, Dealer->Affiliate /affiliate). Verified all against App.tsx registered routes. tsc clean.

## Phase 48: Consolidated Pricing & Margins admin tab (user request 2026-06-24, option C)
- [x] New `pricing_settings` table (single row): globalMarkupBps + per-tier markup bps (homeowner/contractor/wholesale), updatedAt/updatedByOpenId (migration 0019, seeded neutral 10000)
- [x] db helpers: getPricingSettings (seed defaults if missing), updatePricingSettings
- [x] adminProcedure: pricing.adminGetMargins + adminUpdateMargins + adminSetDistributorMarkup (bps range-validated)
- [x] New Admin tab "Pricing & Margins" (MarginsAdmin.tsx): global default markup %, per-tier markup %, per-supply-line override table, live $100 preview per tier
- [x] Per-distributor overrides: editable grid bound to distributor.markupPercent; save via adminSetDistributorMarkup
- [x] Per-tier homeowner markup applied at storefront familyCatalog resolution (shared shared/margins.ts; 0% = unchanged)
- [x] Tests: shared margin math (7 tests in server/margins.test.ts); 531 total pass
- [x] Verified: tab renders in admin bar (authenticated screenshot); no devserver/console errors

## Phase 49: Project-wide combined Bill of Materials (user request 2026-06-24)
- [x] Backend: design.projectSummary(projectName) returns each room (id, name, roomLabel, roomType, styleName, cabinetCount, subtotal) + grandTotal + roomCount; owner-scoped
- [x] Added design.myProjects (distinct projects for the caller with roomCount + latest updatedAt) for a project picker
- [x] Reuses the same cheapest-contractor-price-per-cabinet path as priceForCabinets so per-room totals match the Designer
- [x] Frontend: "View project total" expander under each project group in the My Designs dialog — per-room subtotals + project grand total (lazy-loaded)
- [x] Combined project CSV export (room / type / door style / cabinet count / subtotal + project total row)
- [x] Tests (server/design.projectSummary.test.ts: grouping, owner isolation, grand-total sum, myProjects count); 534 tests pass; tsc clean; /design renders clean

## Catalog categorization audit (2026-06-24)

- [x] Recategorize CB-9 as Accessory / Countertop Support Bracket (placementType accessory/trim, corner=0) — it's a countertop support bracket, not a cabinet
- [x] Exclude accessory/trim items from the placeable Designer palette (server: design.placeableCabinets) so they can't leak into Base/Corner Base
- [x] Fix 3 base cabinets miscategorized as accessory/trim -> placementType=base (BFH-21, BFH-24, BT-09)
- [x] Fix 9 tall utility cabinets miscategorized as accessory/trim -> placementType=tall (U-18/24/30 x 84/90/96)
- [x] Flag 6 easy-reach wall cabinets as corner so they route to Corner Wall tab (WER-24-12GD/15GD/18GD, WER-24-30/36/42)
- [x] Refine corner alt text (lazy-Susan / easy-reach / corner sink) instead of generic "blind corner cabinet"
- [x] Verify category vs placementType consistency across full catalog (no remaining contradictions)
- [x] Add regression test: accessory/trim items never appear in placeable palette
- [x] All 230 vitest tests pass

## Published-site Sign In / OAuth (2026-06-24)

- [x] Verify OAuth callback no longer returns raw JSON dead-end on live site (now 302 -> /?auth_error=...)
- [x] Confirm login URL is origin-relative (works on *.manus.space and custom domains without code change)
- [x] Verify frontend surfaces auth_error as a friendly toast and cleans the URL flag
- [x] End-to-end live test: account creation set a session, redirected to /account, "Signed in successfully" (test account removed)


## Design Tool mobile palette compaction (user report 2026-06-24: not enough space on mobile to view the list)
- [x] Inspect Designer on a mobile viewport (375px) — identify wasted space around palette tabs + cabinet list
- [x] Compact the palette tab row on mobile (scrollable/condensed instead of wrapping into many rows)
- [x] Make the cabinet list space-efficient on mobile (denser rows / collapsible controls / more list height)
- [x] Verify on mobile (375px) + desktop; no regressions to canvas/toolbar; run vitest
- [x] Checkpoint + report


## Checkout cross-sell / upsell page (user request 2026-06-24)
- [x] During checkout (Order Review), show a "Recommended for your order" section before order confirmation (touch-up kit, crown/trim molding, decorative end panels, fillers/scribes, roll-out shelves) — scoped to the cart's chosen door style; one-click add. Implemented via orders.recommendAddOns + OrderReview grouped panel. (Future: tie into Hickory skin auto-suggest output; hardware subcategory empty in catalog so omitted for now.)


## Lazy-Susan corner base L-shaped footprint (user follow-up — earlier L-shape was incomplete)
- [x] Lazy-Susan corner base renders as an L-shape (square box side=width, two 24"-deep legs); see "L-corner footprint rework" section below for the implemented resolution
- [x] L-shape orients correctly for each of the 4 corners via cornerRotationForPlaced (back-left/back-right/front-right/front-left)
- [x] Adjacent cabinets snap to the open end of each leg (legs are 24"-deep flush returns; snapPosition uses the square box edges)
- [x] Unit tests for the L footprint corners/legs (6 new tests in design.logic.test.ts)
- [x] Verified geometry via tests; interactive placement confirmed model

- [x] "Don't forget" upsell cards already hidden on mobile (hidden lg:block), shown on desktop sidebar

## Round: Lazy-Susan L-footprint + mobile + Hickory skins (done)
- [x] Lazy-Susan corner base renders as an L-shape (36x36 / 33x33 box, 24" deep legs) with correct notch from real leg depth
- [x] footprintDepth returns a square bounding box for L-corner bases; cornerClipPath parameterized by real leg ratio
- [x] Verified in designer: LSB36 placed + snapped to back wall shows correct L, pricing shows 36"D
- [x] Mobile: palette tabs scroll in a single row (no wrapping); top toolbar wall/lock/auto-fill/consultant folded into More menu
- [x] Mobile: hid the "Don't forget" add-on upsell cards in the Catalog area (desktop keeps them)
- [x] Hickory exposed-end skin auto-suggest engine (hickorySkins.ts) + tests; wired into BOM build sheet + pricing-panel notice (placeholder SKU, conflict-flagged, pending real SKU/pricing)
- [x] All 553 tests pass


## Checkout cross-sell / upsell step (done 2026-06-24)
- [x] Cart-aware accessory recommendation engine (orders.recommendAddOns) suggesting trays/shelves, end panels, molding, fillers, touch-up kit based on the order's matched cabinets (hardware omitted — no Hardware subcategory rows in catalog)
- [x] Only recommends within the order's chosen door style (styleId-gated, published+available SKUs only)
- [x] Presented on the Order Review step as a grouped "Recommended for your order" panel (not the bottom Shop area); fallback touch-up card retained if the panel can't load
- [x] One-click add from recommendation; re-adding the same item bumps qty (collapses to one line); already-on-order items excluded server-side
- [x] Tests for recommendation engine (orders.recommendAddOns: priced+style-scoped, excludes on-order items) — 2 new tests, 590 pass total
- [x] tsc clean; section gated to appear only after lines are matched + a style is selected


## Admin panel: self-serve white-label (future)
- [x] In the Admin panel, an operator can white-label a cabinet line by typing the public-facing name — no direct DB editing. New LineBrandingEditor component (Admin -> Distributors tab) + distributorAdmin.setBranding admin mutation. Pick a line, choose presentation (neutral plain label / branded real brand / Cabinet Dealz series), type the label (+ optional initials, auto-derived if blank); the mutation sets distributors.displayMode + name/initials | brandName/brandInitials | seriesName and toggles whiteLabel accordingly. adminList now returns all branding fields and the editor seeds from the line's current presentation. 5 DB-aware tests (server/distributorBranding.test.ts: auth-gating, empty-label reject, NOT_FOUND, full neutral/branded/series round-trip with restore). 730 tests pass; tsc clean.

## Session: Lazy-Susan render + Bathroom vanity palette
- [x] Fix LSB36 rendering as 24x36 instead of 36x36 (square footprint at render time + normalize stale stored depth on load)
- [x] placedFootprint() squares L-corner cabinets; PlanCanvas uses it for the render box
- [x] normalizeLCornerDepths() applied on saved-design load, package load, and localStorage draft restore
- [x] Regression tests for placedFootprint + normalizeLCornerDepths
- [x] Bathroom palette: add a dedicated "Vanity" tab (category=Vanity) so bathroom vanities are grouped there instead of mixed into Base
- [x] Vanity tab only appears in Bathroom room type; route Vanity-category cabinets to it and exclude them from the Base tab
- [x] Bathroom defaults to the Vanity tab on room switch; vanities reuse existing base placement query
- [x] Verified in browser: Vanity tab lists 41 vanity cabinets (VB/VS/VDB/V-/BFH/ADA-V), Base tab no longer shows them

## Session: Accessories & Trim tab in Design Tool
- [x] Server: extend placeableCabinets to return accessory/trim items when placement="accessory" (category=Accessory or placementType accessory/trim), keep them out of base/wall/tall
- [x] Client: add an "Accessories & Trim" palette tab (all room types) that queries placement="accessory"
- [x] Accessories add to the design as BOM line items via addAddOn (not spatial canvas boxes); grouped by subCategory (Trim & Molding, Decorative End Panel, Roll-Out Tray, Floating Shelf, etc.)
- [x] Tests: accessory tab returns accessories + crown/filler present; base/wall/tall still exclude them (5/5 placeable tests pass; full suite 571/571)
- [x] Verified live: 64 accessories render grouped by subcategory; clicking CM-2 adds a BOM line with qty stepper + remove, palette item shows added check
- [x] Verify in browser and checkpoint

## Session: Drawer bases "missing" — palette height label fix
- [x] Root cause: base palette grouped by Math.round(height), so 34.5" drawer/base cabinets landed in a "35\" High" bucket and looked missing when scanning for 34.5"
- [x] Group base palette by EXACT height and render half-inches as "34½\" High" (whole inches unchanged, e.g. 42")
- [x] Verified live: header now reads "34½\" High (58)" with all DB-12-3 … DB-36-3 drawer bases under it; no cabinets removed
- [x] FLAG resolved (user approved): BD-15-3 renamed to DB-15-3; DB-33-3 given live SKUs (see next section)

## Session: Drawer-base catalog data fixes (user approved)
- [x] Rename mis-coded BD-15-3 -> DB-15-3 (cabinet id 2 masterCode + its 9 platform SKUs BD153-* -> DB153-*)
- [x] Add 9 published distributor SKUs for DB-33-3 (cloned from DB-33-2 across all door styles; DB332-* -> DB333-*, *-2DB33 -> *-3DB33)
- [x] Verified live: Base tab now shows DB-12-3, DB-15-3, … DB-33-2, DB-33-3, DB-36-3 contiguous; DB-15-3 has 9 live SKUs, DB-33-3 has 9 live SKUs

## Session: Drawer-base SKU backfill across all door styles (user approved)
- [x] Mapped missing (styleId x DB-*) pairs vs the full 14 DB-* lineup (was 742 missing across 62 active styles)
- [x] Restricted backfill to the 14 true DB-* drawer bases (excluded BFH-*/DFB-* which share the Drawer Base subCategory)
- [x] Mirrored pricing from fully-covered reference style 30002 (same distributor 2 as all active styles)
- [x] Dry-run then applied: 742 SKUs inserted, 0 clashes; unique platformSku per (size,style) = DB<code>-S<styleId>-D<dist>; isPublished=1, isAvailable=1
- [x] Verified: all 62 active styles now have full 14-drawer-base coverage (full=62, partial=0, zero=0)
- [x] Verified style ASP/Lumina White (30001, previously 0 drawer bases) now returns all 14 via placeableCabinets

## Session: Cabinet palette search bar
- [x] Existing search bar enhanced (was code+description only) to also match width and height in inches
- [x] Normalize inch tokens so `24"`, `24 in`, `24 inch` all match `24` (without stripping "in" inside words like basin)
- [x] Pure-number queries match cabinet width/height; text+number queries (e.g. "db24") still rely on code/description
- [x] Lifted the 80-item display cap while a search term is active so no matching size is hidden
- [x] Added a clear (x) button and a size-aware placeholder
- [x] Extracted pure helpers into client/src/lib/paletteSearch.ts; 10 unit tests pass
- [x] Verified live: searching "24" surfaces all 24" cabinets across height groups (incl. BSDC-6 matched on 24" height, BS-24-35, BA-24, ADA-*-24)

## Session: Door-style sample preview in pricing panel
- [x] Add a larger door-style sample swatch (DoorStyleSwatch fed by activeStyle) in the Pricing/Build Sheet header
- [x] Show selected style name + door profile / finish next to the swatch; updates live on style change
- [x] Verified live: selecting a style renders the swatch + "Bloom Blanc — Shaker · SW 7006 Extra White"; typecheck clean

## Session: Affiliate storefront templates (superseded by "Storefront templates + Designer enhancements" below — implemented there)
- [x] Add `template` field (enum: classic | showcase | minimal | craftsman) to affiliates schema, generate + apply migration
- [x] Server: include template in affiliates.bySlug, updateMyStorefront, and admin set/update
- [x] Refactor Storefront.tsx into 4 layout variants sharing StorefrontShop + quote flow
- [x] Template picker with preview thumbnails in AffiliateDashboard BrandingEditor
- [~] Template picker/override in AffiliatesAdmin admin panel — picker lives in the affiliate's own Branding editor; admin override deferred (low value, affiliate self-serves)
- [x] Tests for template persistence; typecheck (3 tests in affiliates.test.ts)
- [x] Verify all 4 templates render in browser and deliver

## Build Sheet sample image (interrupt)
- [x] Enlarge the door-style sample on the Pricing/Build Sheet panel into a clear full-width banner at the very top (h-40 swatch with style name + finish label overlaid); 581 tests pass, verified live with Blanc Core

## Wall-cabinet 54" mount default (user bug report)
- [x] Wall cabinets now bottom-anchored at 54" by default (short bridges <18" stay top-anchored); design tests updated, 168 design tests pass

## Refrigerator wall cabinets missing from catalog (user bug report)
- [x] Root cause: 24"-deep refrigerator wall cabinets (W-30/33/36-{12,15,18,24}-24) had SKUs in only ~29 styles vs 61 for anchors
- [x] Backfilled 399 distributor SKUs (idempotent INSERT, pricing copied from same-width W-xx-30 anchor); all 12 fridge cabinets now 61/61 style coverage
- [x] Verified live: Terra Shaker search "W-30-" now lists W-30-12-24 / -15-24 / -18-24 / -24-24 with images, 24" depth, View pricing

## Storefront templates + Designer enhancements
- [x] Storefront branches on data.template (classic/showcase/minimal/craftsman) — 4 distinct header+hero variants, shared body
- [x] Template picker added to affiliate Branding editor (AffiliateDashboard)
- [x] Add vitest covering the template field (bySlug returns it; updateMyStorefront persists valid enum + rejects invalid) — 3 tests, 14 in affiliates.test.ts
- [x] Designer: ceiling-height input (presets 96/108/120 + custom) wired into Front View — see line below ("Designer ceiling-height input ... wired into Front View elevation"); implemented + verified
- [x] Designer: reconcile wall-cabinet hang with documented rule (>=30" bottoms at 54"; <30" raised so top lands ~84", e.g. 12" bottoms at 72") — design.ts threshold <30 top-anchored; server+client tests updated
- [x] Designer: Corner View mode — camera in a chosen corner shows the two adjoining walls together; pick/cycle all 4 corners (verified live: Back/Left corner shows Left-wall + Back-wall cabinets, labels readable, finish applied)
- [x] Designer: cabinets on the canvas re-color to the selected door style finish — implemented (line below: finishColors reads paint/finish/species + fallback; verified Aero Obsidian recolors B-48 to black)
- [x] Door-style color now applies to canvas cabinets (finishColors reads paint color/finish/species + deterministic fallback); verified Aero Obsidian recolors B-48 to black
- [x] Designer ceiling-height input (presets 96/108/120 + custom 84-144"), wired into Front View elevation (wall height + ceiling label); preserved across package preload/save

## Designer: floor-dropped wall cabinet toe-kick (user request)
- [x] When a wall (upper) cabinet is dropped to the floor, its bottom should sit at the toe-kick height (4.5") not flat at 0"


## L-corner footprint rework (user chose option 2 + 1, 2026-06-24)
Resolved spec: a lazy-Susan/blind corner base spans BOTH walls equally, so the
bounding box is square (side = width). Each leg is 24" deep (the "short" depth)
and runs the full width along its wall (the "long" leg). The previous bug was the
notch not orienting to the seated corner and a fixed 0.667 ratio for non-36 widths.
- [x] L-corner cabinets (LSB33/36/36ADA + blind BBC* + ERB easy-reach) render a square box (side = width) with two 24"-deep legs; leg ratio now 24/width (33->0.727, 36->0.667) via cornerLegRatioForPlaced
- [x] cornerClipPath carves the L for all 4 rotations (notch points to room interior); 6-vertex polygon verified distinct per corner
- [x] Added cornerRotationForPlaced: derives the notch orientation from which physical corner (back-left/back-right/front-left/front-right) the cabinet is seated in
- [x] PlanCanvas routes L-corners (and diagonal corners) through cornerRotationForPlaced so the L hugs the two real walls regardless of stored rotation
- [x] Unit tests: detection, square box dims, leg ratio per width, 4-corner clip-path distinctness + 6 vertices, corner-seated orientation, floating fallback (6 new tests)
- [x] tsc clean + full suite green (596 tests)
- [x] Verified geometry via tests; designer requires interactive placement so static screenshot not applicable. Checkpoint pending.


## Base cabinet height bug (user report 2026-06-24: all base cabinets are 34.5" tall) — DONE
- [x] Base palette now treats every base-family tab (Base, Corner Base, Vanity) as a single 34½" height bucket, so spice pull-outs (BSDC-6/SPB-9/SPB-6) and the SBF-42-42 diagonal sink floor no longer fragment into bogus 24"/18"/15"/42" groups
- [x] Base-family tiles display "xx"W × 34.5"H" (the stored insert/opening size is no longer shown as the cabinet height); Wall/Wall-by-Ht/Tall keep their real heights
- [x] Implemented in the grouping layer (no destructive data edit needed; insert sizes preserved in the DB)
- [x] Verified live: Base tab shows one "34½" HIGH (80)" group; full suite green (598)


## Designer palette accordion grouping (user request 2026-06-24) — DONE
- [x] Palette group headers are now collapsible accordion buttons (caret + label + count); clicking toggles the group open/closed
- [x] Per-tab collapse state (collapsedGroups keyed by `${tab}:${label}`); all groups open by default; auto-expands all groups while searching so no match is hidden
- [x] Works across every palette tab (Base, Corner Base, Wall, Wall by Ht, Corner Wall, Tall, Vanity, Accessories, Closet parts)
- [x] Verified live on desktop; full suite green


## Corner cabinet routing audit (user request 2026-06-24: keep Corner Base & Corner Wall separate, no corners in Base/Wall) — DONE
- [x] Base corner cabinets (BBC blind, LSB lazy-Susan, ERB easy-reach, corner sink) classify as corners → Corner Base tab; excluded from plain Base via `!isCornerBase(c)`
- [x] Wall corner cabinets (DCW/WDC diagonal, WER easy-reach wall) classify as corners → Corner Wall tab; excluded from plain Wall/Wall-by-Ht via `!isCornerWall(c)`
- [x] Existing classifier (isCornerCabinet prefix + subCategory + isCornerCabinet flag) covers all real corner codes; no mis-routed rows found in the audit
- [x] Added client classifier routing tests (corner codes vs ordinary codes); full suite green (601)


## Lazy Susans missing from Designer again (user report 2026-06-24) — DONE
- [x] Root cause: LSB33/LSB36/LSB36ADA had placementType "ada base" (category ADA); normalized to "base" so they pass the placeable filter and reach Corner Base
- [x] Server already maps ada base → base; added a belt-and-suspenders data fix + regression test (design.placeable.test.ts) asserting LSB* appear in the base tab when they carry a live SKU
- [x] Verified via tests (7/7 placeable tests pass)


## Regular base cabinets missing from Base tab (user report 2026-06-24, regression) — DONE
- [x] Root cause: a stale/cached build had a `normalizePaletteSearch is not defined` crash (last seen 09:51); current code imports the helper and tsc is clean, so the Base list renders
- [x] Confirmed live: Base tab shows "34½" HIGH (80)" with B-/DB-/SB- cabinets
- [x] Regression test asserts B-12/B-18/B-24/B-36/SB-30/DB-24-2 appear under placement base (design.placeable.test.ts)
- [x] Verified live + full suite green


## Designer: Lock distributor to base cabinet (user request 2026-06-24)
- [x] Added a "Lock supply line to this finish" button in the Designer pricing panel: once a door style is chosen, locking pins the design to that style's distributor (lockedDistributorId)
- [x] While locked, the placeable palette (and Auto-Fill list) only offers cabinets from the locked distributor (placeableCabinets gated by distributorId); everything added shares the same supply line
- [x] User can still CHANGE color/finish but only among door styles the LOCKED distributor offers (uniqueDoorStyles scoped to lockedDistributorId); distributor stays fixed
- [x] "Supply line locked" badge + Unlock button restore the full cross-distributor palette; lock is per-design (not global). NOTE: distributor NAME never shown (door-style-first / white-label rule) — badge shows lock state only, not the supplier name
- [x] Persist lock with saved designs (selectedDistributorId column) AND the auto-save draft; restored on draft restore + saved-design load
- [x] Tests: palette gated to a single distributor when locked (design.placeable.test.ts, 8/8)
- [x] tsc clean; full suite green (602). Designer is behind an email gate so static screenshot capture isn't possible; verified via tests + type-check


## Strict one-family-one-color: reject placeholder image URLs (root-cause of white-shows-cherry) (2026-06-24) — DONE
- [x] Added realImageUrl() guard (doorFamilyPhotos.ts): accepts only absolute http(s) URLs or data: image URIs; rejects the seeded relative placeholders (/room-scenes/, /door-samples/, /thumbnails/) so a 404 placeholder never renders
- [x] Family.tsx hero + door sample now use realImageUrl() → missing photos fall back to the color-accurate finish backdrop + DoorStyleSwatch (no borrowed scene, no broken img)
- [x] CabinetDetail.tsx hero: replaced keyword-guessed kitchenSceneWithCopy() with the style's own real roomSceneImageUrl, else a color-accurate finish band (NEVER a cherry room for a white finish)
- [x] Home/Catalog already filter to styles that actually have a roomSceneImageUrl; their generic landing collages are marketing (not tied to a specific family) so they stay. Storefront uses a per-store hero. Acceptable per the rule.
- [x] Tests: realImageUrl rejects placeholders / accepts CDN+data URIs (4 tests, doorFamilyPhotos.test.ts → 22 in file); full suite green (608)
- [x] Verified live: white family "Blanc Core" (SW 7006 Extra White) renders a light/white color-accurate hero + swatch, no cherry

## Designer: Cased Opening / doorway / window tool (user request 2026-06-24)
- [x] Data model: added "opening" to OpeningKind (door | window | opening); 3 cased-opening presets in OPENINGS (Cased 36", Wide 60", Pass-Through 48"); width/offset/height/sill fully adjustable; persisted with existing openings draft + saved-design plumbing
- [x] Place by selecting a wall, then entering width + offset; OpeningSizeEditor now exposes Height + Sill for the "opening" kind (like windows); width fully adjustable after placement
- [x] Block or warn when a base/tall cabinet overlaps a cased opening or door (baseOpeningOverlaps + blocksFloorRun: door & opening block the floor run, window does not); wired into conflictUids in DesignTool
- [x] Render the opening as a gap: PlanCanvas draws cased opening with dashed casing + light fill + "OPEN" label; ElevationView renders it as a full-height open gap (light recessed gradient, dashed casing, no slab/glazing)
- [x] Tests for overlap detection + presets (7 new tests in design.test.ts: blocksFloorRun, base crossing flagged, wall not flagged, window not blocking base, clear cabinet not flagged, preset shape, makeOpening kind); 615 tests pass; tsc clean; checkpoint


## Phase 45: Designer role — CRM-only admin access (user request 2026-06-24) — DONE
- [x] Added "designer" to the user role enum (schema + migration 0022 applied via webdev_execute_sql)
- [x] A designer logs into the admin backend but ONLY sees the Sales CRM — Admin.tsx short-circuits to a CRM-only view for role==="designer" (no Tabs, no catalog/pricing/distributors/fee system/orders/customers)
- [x] Server gate: CRM procedures are protectedProcedure scoped via resolveScope, which now returns the HOUSE board for admin OR designer; all other admin surfaces stay adminProcedure-only (designer is rejected)
- [x] Admin.tsx: designer short-circuit renders only <CrmBoard>; TopNav shows a "CRM" button (instead of "Admin") for designers on desktop + mobile
- [x] Owner can grant/revoke the role: customers.setRole mutation (user<->designer only; refuses to touch admin/distributor/partner) + "Make Designer / Designer ✓" toggle in the Customers admin panel
- [x] Tests: server/crm.designerRole.test.ts (designer gets house board + can manage deals; designer FORBIDDEN from adminGetMargins / adminGetFeeSettings / customers.list); 647 total pass; tsc clean; checkpoint

## BUG (user report 2026-06-24): catalog "lockdown" feature not working
- [x] FIXED: catalog lockdown (family-lock) not working. ROOT CAUSE: the cart was only checking for mixed families at CHECKOUT (Cart.tsx isMixedFamily disabled the request button), but CartContext.addItem accepted items from ANY door style with no guard — so on the public catalog (CabinetDetail) and Photo-to-Cart you could silently add mixed-family items and nothing appeared to "lock." FIX: (1) new pure helper canAddToCart(lockedStyleId, incomingStyleId) in shared/familyLock.ts (single source of truth, 4 tests). (2) CartContext now exposes lockedStyleId/lockedStyleLabel and addItem returns AddItemResult, rejecting a different family at ADD time. (3) CabinetDetail: on rejection shows a toast that either offers "Add in {locked style}" (auto-switch when the cabinet exists in the locked family) or "Clear cart & add" to start a new family; plus an inline amber lock hint under Add-to-Cart when the selected style differs from the lock. (4) PhotoToCart batch-add is now lock-aware (prompts clear-and-add instead of silently dropping lines). 718 tests pass; tsc clean.

## Feature (user request 2026-06-24): Shaker/framed-door hardware placement spec
- [x] Hardware placement rule for framed (Shaker) vs slab doors. New pure helpers in client/src/lib/hardware.ts: doorConstruction(doorStyle) (framed default; slab for slab/flat/euro), hardwarePlacementSpec(doorStyle) and hardwarePlacementNote(styleId, doorStyle). FRAMED rule: center the knob/pull on the ~3" latch-side stile (within the frame, not the center panel); base doors 2.5–3" up from the bottom rail, wall/upper doors 2.5–3" down from the top rail; drawers centered both ways. SLAB rule: ~1.5" from the latch edge, 2.5–3" from the near horizontal edge. Surfaced as a "HARDWARE PLACEMENT" finishing note on the Design Tool build sheet (only when a hardware style is chosen). 21 hardware tests (10 new); 722 total pass; tsc clean. NOTE: Design Tool visuals are deterministic 2D elevations (no AI photoreal render prompt exists), so the spec drives the installer note; constants (stile width, rail offset) are exported for easy tuning.


## BUG + FEATURE (user report 2026-06-24): Sink base (SB) in Design Tool
- [x] BUG: placing a sink base (SB) cabinet should NOT raise a conflict flag — DONE (sink-base detection across all families excluded from false conflict flags); see "Design Tool batch" section below
- [x] FEATURE: when an SB (sink base) is placed in the plan, auto-place a default sink + faucet on/in that cabinet — DONE (handleDropNew: isSinkBaseCabinet -> makeSink("single") with faucet centered over footprint); see "Design Tool batch" section below
- [x] Tests for both (SB places without conflict; SB placement yields a default sink+faucet); checkpoint — DONE (sink-base conflict-suppression + makeSink tests in design.test.ts)
- [x] BUG: dropping/dragging a WALL cabinet down to the floor keeps wall depth (12"), not base 24" — DONE (dropToFloor preserves nominalDepth; verified by tests); see "Design Tool batch" section below
- [x] FEATURE: when an object (cabinet/appliance/fixture) is highlighted/selected in the Design Tool, the user should be able to rotate it (visible rotate control on/near the selected item + "R" keyboard shortcut to rotate 90 degrees). Confirm rotation persists + redraws + respects room clamping.

## Color-mixing correction (user clarified this session)
- [x] CHANGE: "Lock" semantics corrected. Lock means "I'm done with this color" — it commits the current color and frees the user to pick ANOTHER color for the next cabinets. Mixing colors in one design/order is a first-class, popular feature (two-tone kitchens: white perimeter + contrasting island, etc.). Do NOT block adding a cabinet just because its color differs from an already-added item.
- [x] Remove/relax the family-lock add-time block so it does NOT prevent mixing colors. Keep integrity within a single distributor (cross-distributor mixing still disallowed for pricing/ordering). Door style remains freely selectable within the distributor family.
- [x] Update CartContext.canAddToCart + addItem and CabinetDetail / PhotoToCart lock-aware UI so color differences are allowed; "lock" becomes a commit-and-continue action rather than a restriction.
- [x] Update/replace the family-lock vitest tests to assert color-mixing is allowed within a distributor while cross-distributor is still blocked.

## Design Tool batch (user request this session)
- [x] BUG: placing an SB (sink base) cabinet triggers a conflict — suppress.
- [x] FEATURE: when an SB is dropped, auto-place a default sink + faucet centered over it.
- [x] BUG: dropping a wall cabinet to the floor expands its depth to 24" — must keep 12".
- [x] FEATURE: rotate the highlighted/selected object (rotate control + "R" key). (Already present: toolbar Rotate button + "R" shortcut -> rotateSelected; verified.)
- [x] BUG: browser Back button doesn't work while browsing the website (catalog/detail/general pages). Likely a global routing issue (links/redirects replacing history instead of pushing, or scroll-restoration interfering). Audit wouter routing/navigation + any history.replace usage + the OAuth/redirect handling. Make Back navigate to the previous page as expected.


## Designer multi-color (two-tone) support — confirmed "both" (default + per-cabinet override)
- [x] Add per-cabinet finish override to design state (each PlacedCabinet can carry its own styleId; falls back to design default styleId)
- [x] Default/base finish stays (whole-design), plus select-a-cabinet -> choose a different finish/color within the LOCKED DISTRIBUTOR family — selected-cabinet toolbar finish picker (Match design + uniqueDoorStyles, scoped to lockedDistributorId)
- [x] Pricing: price each placed cabinet by its effective styleId (default or override); build sheet + totals reflect mixed finishes — priceMap keyed on cabinetId:styleId, unitPriceFor uses effectiveStyleId; vitest confirms same model prices differently per finish
- [x] Canvas: show each cabinet's own finish swatch/color; selected-cabinet panel shows finish picker (distributor family only) — finishFor/panelKindFor (effectiveStyleId) passed to PlanCanvas + ElevationView + CornerView + split view
- [x] "Finish applied to design" summary updated to list multiple finishes when mixed — new distinctStyleIds/isMixedFinish drive a "Two-tone design — N finishes" list with per-finish swatch + name (design default first); single-finish designs keep the original one-line summary
- [x] Persist per-cabinet finish in saved design draft/load
- [x] vitest: per-cabinet effective-style resolution + mixed pricing — effectiveStyleId, distinctStyleIds, isMixedFinish, and price-map keying (216 design tests pass)

## Live shipping plugin (replace too-low in-house estimate) — pending provider/key
- [ ] Admin -> Shipping plugin panel: provider (EasyPost/Shippo) + secure API key, origin ZIP(s), 8ft pallet caps (max wt + cu ft), freight class, $800 kitchen floor, handling markup, mode toggle, "Test live quote" button
- [ ] Cabinet catalog: add packaged (flat-pack / not assembled) weight (lbs) + cubic feet fields, admin-editable
- [ ] Server: live LTL quote integration (per packaged weight + cubic feet, derive pallet count from 8ft pallet caps), apply $800 kitchen floor + markup
- [x] Cart/Packages: show live rate when configured; otherwise "Shipping quoted live at order" with NO guessed freight folded into price
- [ ] vitest: pallet derivation, $800 floor, markup, fallback-when-not-configured


## Design Tool: adjustable ceiling height (user request)
- [x] Add editable ceiling height (feet/inches) to room/design state (default 96")
- [x] Persist ceiling height in saved design draft/load
- [x] Elevation/Front view uses ceiling height for wall bounds (affects stacked wall cabinets, crown headroom, light rail)
- [x] Wall-cabinet mount + crown math respects taller ceilings — new wallCabinetTopLine(room) (= 84" on 8ft, rises to ceiling − 12" soffit reveal on 9/10ft, never below 84"); elevationBox(p, room) hangs short bridge/over-appliance + glass-stacker uppers from that higher line so they finish near the ceiling, while standard 30"+ uppers stay bottom-anchored at 54"; crown band (drawn at box top) follows automatically. Room threaded through ElevationView + DesignTool mount UI. 5 new vitest cases
- [x] vitest where ceiling height affects derived layout


## Design Tool: countertop draws over refrigerator/appliances (bug)
- [x] Countertop slab must exclude appliances (refrigerator, range, dishwasher) and tall cabinets
- [x] Only cover base / sink-base / peninsula / island base cabinets — new bearsCountertop() helper (base placement + sink-base; excludes panels/skins via isPanelItem and FILL-*/"Filler"/"Scribe" strips); countertopSurfaces (plan) + ElevationView band both filter through it
- [x] Verify in plan + elevation + split views — plan slab + elevation band share bearsCountertop (split renders both); tall/appliances already excluded by placement; 7 new vitest cases (bearsCountertop + countertopSurfaces panel/filler/sink-base)
- [x] vitest on countertopSurfaces excluding appliances/tall


## Cart / Checkout layout (user request)
- [x] Cart page: declutter so the cart item list is clearly visible (too much in the way today)
- [x] Move the add-on / upsell ("you might also need") sales area OUT of the cart
- [x] Place the add-on sales area on the checkout page/step instead
- [x] Verify cart item list readable on mobile + desktop

## Live shipping quote + Admin shipping plugin (done)
- [x] Schema: extend shipping_settings (quoteMode, liveProvider, liveApiKey, $800 kitchen floor, kitchenMinCabinets, 8ft pallet caps, freightClass, defaultCabinetCubicFt); migrate
- [x] Pure pallet builder + $800 kitchen floor logic (shared/liveFreight.ts) + unit tests
- [x] EasyPost LTL provider client (server/_core/easypost.ts) + unit tests (injected fetch)
- [x] freight router: live-quote path (pallets, markup, $800 floor), estimator fallback, testLiveQuote admin procedure
- [x] Admin Shipping panel rebuilt: mode toggle, provider, write-only API key, origin ZIP, freight class, $800 floor, kitchen min, handling markup, 8ft pallet caps, default cube/weight, Test live quote button
- [x] Remove guessed freight from package landed cost (estFreight=0); storefront shows "Shipping quoted live at order"
- [x] Cart: no guessed freight; "Shipping quoted live on your order"
- [x] Full suite green (786 tests), tsc clean
- [ ] Connect live EasyPost API key (awaiting user account) + run live test quote

## Admin Cost Lookup / Verify & Correct (priority 1)
- [x] Search a cabinet by number/SKU (optionally narrow by door style/line)
- [x] Show current stored cost (per door style/line where price varies) + full price ladder (list/wholesale/contractor/homeowner)
- [x] Inline edit/correct the cost; save back to catalog immediately
- [x] Audit/change log: who, old -> new, when (cost_change_log table + History panel)
- [x] Admin-only procedures (adminLookupCost/adminUpdateSkuCost/adminCostHistory) + vitest (6 tests)

## Affiliate white-label + per-door-style markup (priority 2)
- [x] Schema: per-affiliate branding (name/logo/accent/hero/tagline+ES) + per-door-style optional markup % overrides (affiliate_style_branding)
- [x] Blank style % = fall back to category then default; affiliates can set any % (no caps — relaxed to a sanity-only 1,000,000 bps)
- [x] Pricing resolver applies affiliate per-style % (style > category > global precedence) across storefront catalog (shared/affiliateBranding.ts + useStorefrontBranding)
- [x] Affiliate portal (AffiliateDashboard “My Catalog & Pricing”) per-style markup table covering ALL active door styles + Admin AffiliatesAdmin
- [x] White-label storefront via affiliate referral link (branding + affiliate pricing on /store/:slug)
- [x] vitest coverage (affiliates.branding.test.ts incl. no-cap + all-styles tests; affiliateBranding.test.ts precedence; storefront.branding.test.ts)

## Authorize.Net payments (priority 3)
- [x] Accept.js tokenized card entry (no card data on server) — PCI-friendly (PayWithCard.tsx loads env-specific Accept.js, tokenizes client-side, sends only the opaque nonce)
- [x] Charge 100% upfront, AFTER live freight quote is attached (PayWithCard gates on a freight amount > 0; server recomputes the authoritative total = merchandise + fee stack + freight before charging)
- [x] Admin Payments tab: secure credentials (API Login ID, Transaction Key, Client Key), sandbox/production toggle (PaymentsAdmin.tsx; transaction key is write-only, never returned to the client — only a hasTransactionKey flag)
- [x] Server payment + order capture + vitest (authorizeNet.ts charge helper; payments router charge/adminGetSettings/adminSaveSettings/publicConfig/adminList; payment_settings + payments tables; approved charge marks the order confirmed; 13 tests in authorizeNet.test.ts + payments.test.ts)

## UI fixes (2026-06-24 user request)
- [~] Order review / line items: only one line item visible — set aside by user ("forget it", 2026-06-25); could not reproduce, awaiting screen confirmation if revisited
- [x] Move the chat widget from the bottom-right corner to the top-right corner (ChatWidget launcher + panel now anchored top-20/top-36 right-5)

## More UI requests (2026-06-24 batch 2)
- [x] Remove the add-on / recommended sales section ("recommendGroups" + fallback touch-up-kit suggestion) from the design/order review area
- [x] Customer custom-sizing feature: Design Tool selected-cabinet Width stepper (−/+ & exact input, 6–48″), captures nominalWidth, flags "Custom" on canvas/dimLabel + build sheet description ("— CUSTOM N″W"), with Reset to catalog width

## Resize extended (2026-06-24 batch 3)
- [x] Extend custom-sizing in Design Tool: customer can resize WIDTH, HEIGHT and DEPTH (DimStepper W/H/D, −/+ & exact field; W 6–48", H 6–96", D 6–36"); captures nominalHeight/nominalDepth, per-dim Custom highlight + customSizeNote on build sheet ("— CUSTOM 27"W × 40"H"), single Reset restores all; build-sheet grouping keyed by W|H|D; 5 vitest cases

## Custom adjustment fee (2026-06-24 batch 4)
- [x] Add a flat $100 "custom adjustment" fee per resized cabinet (any W/H/D differs from nominal): CUSTOM_SIZE_FEE/customSizeFee helpers; added to Design Tool estimated total + a "CUSTOM-ADJ" priced build-sheet line (qty = # resized cabinets); "Custom +$100" badge in the resize toolbar; also folded into server design.projectSummary subtotal so saved/CRM totals match; 4 new vitest cases (816 pass)

## Design Tool improvements (2026-06-24 batch 5)
- [x] Countertop material selector → compact dropdown (Estimate & Build Sheet panel) replacing the tall 3-up swatch grid; shows a color chip + name
- [x] Countertop material already flows into the build sheet as a "COUNTERTOP (quote)" line naming the material (verified)
- [x] Auto-apply ALL trim types: crown auto-on when wall cabinets exist, light rail auto-on with wall cabinets, toe kick auto-on with a base run, batten auto-on when seams exist; each keeps a manual toggle (explicit user off is remembered via userTrimOverride refs so auto-apply won't fight it); linear-foot/stick quantities already auto-calc
- [x] Tap/select any placed cabinet opens its edit controls (PlanCanvas onSelect on tap; contextual edit row + on-canvas handles)
- [x] Reliable rotate: on-canvas rotate handle (rotateCabinet by uid) added next to delete, plus existing toolbar Rotate + "R" key
- [x] Render drawer fronts in elevation/front view: DoorFront now splits into a drawer stack (one front per drawer) + door region; displayDrawerCount gives drawer bases their full stack and standard base cabinets a top drawer (skips corner/lazy-susan/trash); 5 vitest cases
- [x] Auto-add finished END PANELS for ALL exposed cabinet ends (generalEndPanels via exposedEnds, priced from the catalog end-panel SKU when available, else a pending placeholder) + existing Hickory skins + auto blind-corner fillers; banner notes both

## Design Tool conflict + depth fixes (2026-06-24 batch 6)
- [x] Broaden isSinkBaseCabinet to cover ALL sink-base/vanity-sink families (FSB, CSB, SBF, VSD, VA, ADA-VS, ADA-SB, BFH-with-sink) so a sink fixture over any sink base is never flagged as a conflict; excludes false positives (LSB=Lazy Susan, VA-48=Valance, BFH-18=plain base); 2 new test blocks (15 assertions) in design.test.ts
- [x] Wall cabinet dropped to the floor keeps its OWN depth (12" upper stays 12", not 24"): dropToFloor pins the resolved depth (and nominalDepth) before placement flips to "base" so the base-depth fallback can never expand it; resolved while still placement==="wall" via p.depth (guarded to STD.WALL_DEPTH)
- [x] tsc clean + full suite 822 tests pass; checkpoint

## BUG (user report 2026-06-25): switching color changes the WHOLE kitchen (need 2 door styles in one design)
- ROOT CAUSE: the main Pricing-panel door-style dropdown sets the DESIGN DEFAULT (styleId); every cabinet without an override inherits it, so changing it repaints everything. Two-tone needs a per-cabinet / per-selection second style, not a default swap.
- [x] Make per-cabinet finish assignment the primary two-tone path: select a cabinet -> "Finish (this cabinet)" picker -> ONLY that cabinet changes. Picker is now visually highlighted (gold ring) so it's obvious.
- [x] Add an "Apply to all" quick action next to the per-cabinet picker: spreads the selected cabinet's override finish to every other cabinet in one click (applySelectedFinishToMatching).
- [x] Relabel the main door-style dropdown as "Design default finish" with a hint that it applies to all non-customized cabinets and that the per-cabinet picker is the two-tone path.
- [x] Warn (confirm dialog) before a default change that would recolor already-placed cabinets; overridden cabinets are never touched (changeDefaultStyle).
- [x] Tests: changing default leaves overridden cabinets untouched; per-cabinet override recolors only the target; "Apply to all" spreads correctly (3 new vitest cases, 219 design tests pass); tsc clean.

## Design Tool email punch list (user, 2026-06-25) — First Class Flooring & Cabinet Design
- [x] (1) DONE — right-click a cabinet opens CabinetAttributesDialog: resize W/H/D ($100 custom fee + reset), Remove door (open-unit toggle, OPEN hatch on plan), Door swing Left/Right hinge, Handle position L/R (gold dot on plan), Roll-out trays stepper (base only, reconciled into BOM); notes flow to build sheet via cabinetAttrNote; fields persist in draft; cabinetAttrNote tests added
- [x] (2) DONE — Conflicts tab cards now have an "Edit" button opening a dialog to fix description, category/sub-category and W/H/D plus amend the review note; "Save changes" or "Save & clear" (fix + return to live in one step). New admin-only updateConflictCabinet procedure (partial patch; clearAfter resets flags). 5 patch-contract tests added
- [x] (3) Cannot move a cabinet once dropped onto the island -> FIXED: base cabinets rendered at z-[2] (above the island guide's z-[1]) so they receive pointer-down and can be dragged/selected on the island; island guide still grabbable on empty area and carries its cabinets via onIslandMove
- [x] (4) Click a cabinet -> move left/right/up/down, rotate, delete: arrow keys nudge selected cabinet (1", Shift=1/4") via nudgeSelected + clampCabinetsToRoom; Rotate (R), Swing (S), Delete already on toolbar + keyboard
- [x] (5) DONE — placeable accessories (decorative/end panels, skins, appliance garages) now click-or-drag onto the drawing as boxes (panels render as a slim 0.75" board, correct base/wall placement via accessoryPlacement); loose by-the-foot trim & hardware (crown, light rail, roll-out trays, pulls) stay BOM quantity lines via isLooseTrimItem; isPlaceableAccessory tests added
- [x] (6) DONE (structural) — server already normalizes any non-wall/non-tall floor cabinet into the Base tab; client base-family grouping no longer emits a stray "Other" group (unknown-height base items now read as 34½" High). NOTE: no literal "Other" TAB exists; if specific SKUs still group wrong, need a screenshot to map exact rows
- [x] (7) Wholesale/contractor (pricing tier) select now sits directly under the two color swatches in the "Door styles & pricing" block
- [x] (8) Two color buttons (Color 1/Color 2): active swatch is highlighted; new cabinets stamp the active slot's styleId (styleB present) so A-cabinets keep A, B-cabinets keep B
- [x] (9) Replaced "Lock supply line to finish" button with the two-swatch ColorSlotButton selector (active = chosen door style, second = alternate/Set second door style); clicking a slot makes it active
- NOTE: items 8 & 9 are the same two-color feature; implement once as a two-swatch selector replacing the lock button.

## Group A — self-contained Design Tool items (user picked "A first", 2026-06-25)
- [x] A1: DONE — already gated: placeableCabinets filters on distributorSkus.styleId === selected style (palette shows only cabinets with a live SKU for that door style); same gate backs storefront listForStyle. Added a style-only gate test (excludes cabinets carried only under another style); 9 placeable tests pass
- [x] A2: DONE — corner range/oven auto-filler. New tested `autoPlaceRangeFillers(placed, room, fillerIn, makeUidFn)` helper in design.ts: finds rangeOvenClearanceViolations(), inserts a 3" base filler (FILL-3 "Range/Oven Clearance Filler") on the appliance's interior side and shifts the adjacent same-wall base/tall cabinets outward to open the gap. DesignTool's existing "Add clearance filler" warning button now delegates to this single tested helper (removed the duplicated inline logic). 4 new vitest cases (filler inserted + neighbor shifted + violation cleared; end-corner case; no-op same-ref when clean; two ranges on different walls)
- [x] A3: DONE — named saved designs were already wired end-to-end and verified: (a) Save dialog has a required "Design name" input (+ optional Master Project / Room label + "Send to a Cabinet Dealz rep"); (b) `design.save` persists name/projectName/roomLabel/roomType and updates-by-id (rename/Save-over); (c) `design.myDesigns` + `design.byId` retrieve them, My Designs lists them grouped by project; (d) CRM access: `crm.linkableDesigns` lists the owner's named designs, `crm.linkDesign` snapshots the name onto the deal, `crm.requestQuoteFromDesign` creates a house lead with the design attached. Added a test (save named design → retrieve by id with project grouping → appears in myDesigns → rename on re-save); 3 designLink tests pass
- [x] A4: DONE — already implemented + tested. `activeWall` state with a toolbar wall selector (Top/Bottom/Left/Right) and a click-to-select highlighted wall band on the PlanCanvas (gold band + label, `onSelectWall`). New cabinets/appliances/openings march along the active wall via freeSegmentsOnWall + nextFreeSpotOnWall + wallPlacementAt; per-wall Auto-Fill targets the highlighted wall. Coverage: snapToWall (6), nextFreeSpotOnWall, freeSegmentsOnWall (openings/cabinets/per-layer), wallPlacementAt all unit-tested
- [x] A5: DONE — adjustable door/window/opening sizes. When an opening is selected, the inline `OpeningSizeEditor` lets the user type an exact Width (clamped 6"–wall length) plus Height + Sill for windows and cased openings (doors stay standard 80" tall); complements the on-canvas drag-resize handle. All edits commit through clampOpening so width/offset stay in-bounds. Added 2 tests (custom 84" width re-clamps offset to fit; width floors at 6" minimum); 238 design.test.ts tests pass

## Cluster 1 — Design Tool accuracy/rules (user picked "1 and 3", 2026-06-25)
Audit result — these rules were already implemented & verified, NO new work needed:
- [x] C1-audit: Base cabinets start at floor (bottom 0) — confirmed in elevationBox()
- [x] C1-audit: Wall cabinets bottom-anchored at 54"; cabinets <30" tall ride high (top-anchored at upper-run line, e.g. 12" box bottoms at 72" on 8ft ceiling) — confirmed
- [x] C1-audit: 4.5" toe kick constant + "dropped to floor" wall cabinet stands on toe kick — confirmed
- [x] C1-audit: 3" wall-cabinet clearance from doors/windows (wallOpeningClearanceViolations + WALL_OPENING_CLEARANCE_IN + warning banner) — confirmed
- [x] C1-audit: Auto sink+faucet when a sink base (SB-*) dropped (+ auto-enable countertop) — confirmed
- [x] C1-audit: Editable ceiling height (RoomSizeControl field + presets + MIN/MAX, persists to room.ceilingHeight) — confirmed
- [x] C1-audit: Accordion-style collapsible palette group headers — confirmed

Real gaps to build:
- [x] C1-a: DONE — unified the two corner palette tabs into ONE "Corner" tab. New client paletteType "corner" merges base-placement corner cabinets (isCornerBase) + a dedicated wall-placement query (isCornerWall), de-duped by id, split into "Corner Base Cabinets" / "Corner Wall Cabinets" accordion sections. Removed cornerbase/cornerwall tabs from all room-type tab lists; per-item dimension label is base-aware (34.5"H for corner bases, real height for corner walls). Type-check clean; verified in /design screenshot
- [x] C1-b: DONE — door thumbnail on cabinet select. The selected-cabinet contextual row now shows a door-style sample thumbnail (style.doorSampleImageUrl) next to the cabinet line-art, with the style name; falls back to a finish-colored "Door" chip (activeFinish face/edge/label) when the style has no sample photo. Type-check clean

## Cluster 3 — Admin & merchandising (audit + completion)

Audit verdict: the Admin page (/admin) already ships every requested capability as a real, working tab (not placeholders). Verified by reading each component + its routers:
- [x] C3-distributors: DONE — Distributors tab = LineBrandingEditor + DistributorImport. CSV catalog pipeline: download master catalog CSV + import template, upload/paste a distributor CSV, server importPreview (surfaces conflicts/corrections) then importCommit. Covered by distributorImport.test.ts.
- [x] C3-subscribers: DONE — Customers tab (CustomersAdmin): lists members, sets pricing tier (customers.setTier) and role incl. Designer toggle (customers.setRole). Covered by customers.test.ts.
- [x] C3-pricing-multipliers: DONE — Pricing & Margins tab (MarginsAdmin): global default markup + per-tier markups (Homeowner/Contractor/Wholesale) with live $100 preview, plus per-supply-line markup overrides. Persists via pricing.adminUpdateMargins + pricing.adminSetDistributorMarkup. Wraps FeeSystemAdmin. Covered by margins.test.ts (math) + NEW pricing.distributorMarkup.test.ts (3 DB-backed tests: non-admin guard, set+read-back override, out-of-range reject).
- [x] C3-catalog-conflicts: DONE — Conflicts tab (ConflictsAdmin): lists held products (hidden from catalog/storefront/Design Tool), edit product data, Save / Save&clear / Clear conflict via cabinets.updateConflictCabinet + cabinets.clearConflict. Covered by conflictStatus.test.ts.
- [x] C3-featured-doorstyles: DONE — Featured Styles tab (FeaturedStylesAdmin): pick + reorder + remove featured door styles (cap 30), persists via doorStyles.setFeatured + reorderFeatured; public doorStyles.featured consumes the ranked row for the "push top 2-3" merchandising. Covered by featuredStyles.test.ts.

## Lead capture at designer launch (user request: "ideally email, but get their contact info too")

- [x] L1: DONE — design_leads table (email required; name/phone/roomType optional; userId nullable; source, launchCount, lastLaunchAt, timestamps). Migration 0029 applied.
- [x] L2: DONE — design.captureLead public procedure (email required, name/phone/roomType optional; de-dupes by email/userId and bumps launchCount; notifies owner on new lead). Also added admin-gated design.listLeads.
- [x] L3: DONE — EmailGate now collects Full name (optional) + Email (required) + Phone (optional) with icons; onVerified passes a LeadContact {email, name, phone}; logged-in users still bypass via effect.
- [x] L4: DONE — DesignTool fires design.captureLead on launch (fire-and-forget) and stores verifiedName/verifiedPhone; the Countertop Quote dialog now prefills name+phone too (defaultName/defaultPhone).
- [x] L5: DONE — new Admin "Design Leads" tab (DesignLeadsAdmin): searchable table of name/email/phone/room/launch-count/last-activity/guest-vs-member, mailto + tel links, powered by design.listLeads (admin-gated).
- [x] L6: DONE — design.captureLead.test.ts (4 tests): email validation, persists+normalizes email/name/phone, de-dupes + bumps launchCount preserving earlier name, listLeads admin-gated. Type-check clean; full suite 874 tests pass (78 files).

## Design lead -> CRM auto-deal (user: "yes")

- [x] D1: DONE — dealId int (nullable) added to design_leads; migration 0030 applied.
- [x] D2: DONE — captureLead now auto-creates a HOUSE crm deal (affiliateId NULL, source "storefront", stage "new", contact name/email/phone copied) on NEW lead only, best-effort, and stores dealId back on the lead. Repeat launches hit the de-dupe branch (no new deal). Type-check clean.
- [x] D3: DONE — added 2 tests (new lead creates exactly one house deal linked via dealId, affiliateId null, stage new; repeat launch does not create a second deal). 5/5 in design.captureLead.test.ts pass; cleanup removes both deal + lead rows.

## Affiliate membership offer ($1,195/yr) (user: price + annual + benefits)

- [x] M1: DONE — shared AFFILIATE_MEMBERSHIP constant (priceUsd 1195, billingPeriod "year", 3 benefits: Kitchen Design Software / Your Own Website / Buying-Group Access) + formatMembershipPrice() and membershipPriceLabel() helpers in shared/affiliate.ts.
- [x] M2: DONE — affiliate page (/affiliate) now shows the membership offer in both the signed-out hero (navy hero + $1,195/year + 3 benefit cards + Apply to join / Sign in) and the signed-in-but-not-an-affiliate state (membership card with price, benefits, Apply to join). CTA links to /pro-network. Verified via screenshot.
- [x] M3: DONE — added 4 shared membership tests (price=1195/year, 3 benefit titles, price formatting with separator, full label "$1,195/year"). Type-check clean; full suite 879 tests / 78 files pass.

## Public Countertops gallery page (storefront)
- [x] CT1: DONE — /countertops page with swatch grid from COUNTERTOP_MATERIALS (real fill/edge/speckle render) + selectable material detail card (blurb + highlights), backed by new shared/countertops.ts (ids synced to design.ts)
- [x] CT2: DONE — built-in quote form reuses design.requestCountertopQuote (email required + validated; name/phone/zip/material/sqft/notes; success state with reset)
- [x] CT3: DONE — added Countertops to shared NAV_LINKS (TopNav desktop+mobile) + /countertops route in App.tsx; hero + form CTAs link into /design to measure. Added dependency-free useSeo hook for title/meta. Type-check clean
- [x] CT4: DONE — shared/countertops.test.ts (4 tests: ids synced to design.ts render materials, every material has name/blurb/2+ highlights, lookup helper, names match). Type-check clean; full suite 883 tests / 79 files pass

## Barcode-scan ordering (Build an Order)
- [x] BC1: DONE — BarcodeScanTab.tsx live camera scanner (native BarcodeDetector, environment camera, scan reticle overlay, 1.5s debounce, haptic buzz), accumulates a running scan list (dedupe+qty bump), graceful fallback message + disabled state when BarcodeDetector unsupported or camera denied.
- [x] BC2: DONE — added as 4th OrderBuilder tab (Scan a Photo / Scan Barcode / Import CSV / Type Codes); scan list supports manual add (Enter key), qty edit, remove, clear-all; "Match N codes" feeds orders.matchCodes -> OrderReview. Added "barcode" to OrderReview source union, server createRequest enum, and order_requests.source DB enum (migration 0031).
- [x] BC3: DONE — client/src/lib/scanList.ts pure helpers (addScan dedupe+bump, setScanQty clamp 1..999, removeScan, totalScanQty, normalizeScanCode) with 9 passing tests. Type-check + checkpoint after UI wiring.

## Door-photo tool (two-way: correct sample + match a door)
- [x] DP1: DONE — added door_styles.doorSampleVerified (green-check flag) + door_style_corrections review-queue table (styleId, imageUrl, fileKey, previousImageUrl for undo, note, status pending/approved/rejected, submittedBy/Name, reviewedBy/At/Note, timestamps). Migration 0032 applied.
- [x] DP2: DONE — doorStyles.submitCorrection (protected): uploads photo to S3, admin = instant apply to live sample + doorSampleVerified=true + logged approved; non-admin = pending row (keeps previousImageUrl for undo). doorStyles.listCorrections (admin, filter pending/approved/rejected/all w/ style name+before/after) + reviewCorrection (admin approve applies+verifies / reject). listForAdmin already returns doorSampleVerified. Type-check clean.
- [x] DP3: DONE — (a) DoorPhotoCorrectButton (file/camera pick -> client downscale to 1600px -> submitCorrection) + green VerifiedCheck added to each row in FeaturedStylesAdmin; admin upload applies instantly. (b) New Admin "Door Corrections" tab (DoorCorrectionsAdmin): status filter (pending/approved/rejected/all), before->after swatches, submitter + note, Approve (applies+verifies) / Reject. Type-check clean.
- [x] DP4: Shopping — "Match a Door from a Photo": upload/take photo -> vision model (doorStyles.matchFromPhoto) ranks top 3 catalog styles with confidence -> tap to shop. Surfaced on the Door Styles page (DoorPhotoMatchWidget)
- [x] DP5: Tests (rankDoorMatches normalization/dedupe/cap) + full suite green (897 passed) + type-check clean + checkpoint
- [x] ADMIN: Featured Door Styles panel flags every unverified door with an amber "Wrong door? Upload the correct photo" marker + a green check once verified, plus a summary badge counting how many need the correct photo

- [x] Responsive nav: top nav overflowed/clipped on tablet (768) and laptop (1024–1440). Restructured into 5 primary inline links + consolidated "More" dropdown (Build an Order, Photo to Cart, Pro Network, Portals); hamburger now handles <1024. Verified at 768/1024/1280/1440. Tests 897 pass, tsc clean.


## Session: Pro Designer Booking + Sales Rep + Affiliate Fee (in progress)
- [x] Schema: designer_availability, design_consultations, affiliate_invoices, sales_commissions; affiliate membership fields; users.role += sales_rep; migrated
- [x] Backend consultations router: openSlots, availableDesigners, book (claims slot + creates CRM deal + meeting activity), myAvailability, addSlot, removeSlot, myConsultations, setConsultationStatus, myDesigns
- [x] trpc: designerProcedure + crmStaffProcedure
- [x] Customer UI: "Get a Professional Designer" CTA + scheduling dialog in Design Tool (ProDesignerDialog: pick designer/slot, prefill verified contact, attach current design)
- [x] Designer UI: manage availability (add/remove slots) + view/confirm/complete/cancel consultations (ConsultationsAdmin)
- [x] Share-live: read-only follow link /design/session/:token (polling) + Meet/Zoom meetingUrl field for voice
- [x] Sales Rep (1099) role: restricted admin workspace (CRM + My Commissions + Design Tool button), server-gated via crmStaffProcedure + resolveScope
- [x] Sales commissions: $400 one-time per won deal owned by a sales rep (idempotent); admin Sales Commissions tab (pending->paid)
- [x] Affiliate program: $1,195 annual membership invoice; pending->paid (stripe/external_card/manual); admin Affiliate Invoices tab
- [x] Tests + type-check + checkpoint (tsc clean, 915 pass; shared salesPrograms helpers unit-tested + wired into prod crm/membership logic)

## Session: Affiliate PDF + Price Audit
- [x] Sales-rep commission + membership-term unit tests (shared/salesPrograms.test.ts, 10 tests); full suite green 915
- [x] Checkpoint after pro-designer + sales-rep + affiliate-invoice features (a6f7b27e)
- [x] "Benefits of Being an Affiliate" PDF (assets/Cabinet-Dealz-Affiliate-Benefits.pdf, 5pp): store overview + 60+ door styles, co-op/buying-group purchasing, membership meaning, $1,195/year, white-label storefront + 4 templates, markup control, CRM, AND step-by-step how-to for the Design Tool + Get-a-Professional-Designer/share-live
- [x] Admin Price Audit tab (renamed Cost Lookup -> "Price Audit"): look up by queue number (#id) OR model/master code -> full price ladder across lines/styles -> correct any field inline (audit-logged) -> "Mark price verified" button + Audited/Not-audited badge with verifier name + date. Shared parsePriceAuditQuery helper, unit-tested (6 tests)
- [x] Final tests (921 pass), type-check clean, Price Audit tab verified in preview, checkpoint

## Spanish localization (deep)
- [ ] Full Spanish must reach granular product detail, not just headlines: cabinet/door long descriptions AND spec phrases ("one shelf" -> "un entrepaño", "two doors" -> "dos puertas", "soft-close", "adjustable shelf", dimension wording). Decide approach for long-form: (1) auto-translate at display time vs (2) stored Spanish description column. Short structured spec phrases -> fixed Spanish phrase map regardless. AWAITING owner choice on long-form approach.


## Session: Bilingual EN|ES (site-wide + storefronts)
- [x] i18n foundation: LanguageContext + persisted EN|ES toggle in top nav, applies site-wide incl. affiliate/member storefronts
- [~] Spanish dictionary for UI chrome + page copy. DONE: nav/topnav (desktop+mobile), Home (full), Catalog (full), Door Styles (full), global Cart (full). REMAINING: Design Tool, checkout/OrderBuilder, Account, Packages, Countertops, secondary pages.
- [ ] Spanish spec-phrase map for structured cabinet specs (one shelf -> un entrepaño, two doors -> dos puertas, soft-close, adjustable shelf, dimensions)
- [ ] Catalog long-form descriptions: server translate-on-demand + cache into ES (cabinets + door styles)
- [ ] Spanish affiliate benefits PDF "Beneficios de Ser un Afiliado"
- [ ] Tests, type-check, verify EN/ES across pages + a storefront, checkpoint


## Bilingual (EN/ES) — Design Tool translation
- [x] Design Tool: main shell (toolbar, palette tabs incl. room-type strip Cocina/Baño/Lavandería/Clóset/Otros + Base/Esquina/Pared/etc., panels, primary toasts/confirms/prompts) translated to ES
- [x] Design Tool: dialogs (CabinetAttributes, CountertopQuote, ProDesigner, EmailGate, OpeningSizeEditor) translated to ES
- [x] Design Tool: canvas/elevation/help/controls. DONE: EmailGate, WallPicker, CornerView, ColorSlotButton, RoomSizeControl, OpeningSizeEditor, PlanCanvas, ElevationView, DesignActions (UI; CSV kept EN), DesignHelp translated to ES
- [x] Design Tool: DesignSession + PlanSheet pages translated to ES (shared live-session follow page + printable graph-paper worksheet, both wired to useLanguage; verified live in ES)
- [x] Final full test suite (925 pass) + EN/ES visual spot-check + checkpoint


## Estimate & Build Sheet — collapsible sections (user request)
- [x] Make each section of the Estimate & Build Sheet collapsible (Door Styles & Pricing, line-item list, two-tone finishes, exposed-ends note, totals)
- [x] Apply collapsible behavior on BOTH mobile drawer and desktop/PC sidebar
- [x] Sensible default open/closed states; remember within session

- [x] Build Sheet line items: clearly show each cabinet's specific door style/color (swatch + finish name) per line, so two-tone designs are unambiguous

- [x] Build Sheet: group cabinet line items into collapsible sections (Base [incl. full-height/tall base merged], Wall, Appliances) — no separate tall section
- [x] Build Sheet: wrap fillers/trim/countertop/add-ons in a collapsible "Trim & Extras" group; keep Estimated Total + Export always visible
- [x] Update buildSheetCsv.test.ts for the new Color / Finish column (8 tests passing)


## Bilingual (EN/ES) — Catalog descriptions + Family page (extension)
- [x] Built deterministic Spanish spec-phrase translator (translateSpec) with ordered phrase map (door/drawer/shelf counts, ADA, vanity, sink base, lazy susan, microwave/oven combo, fillers, end panels, crown/trim, glass doors, refrigerator/range hood, L/R hand) — 13 unit tests passing
- [x] Wired translateSpec into Catalog cards, CabinetDetail header, StorefrontShop affiliate cards + recommender, and Family page cabinet cards (specs read in ES when active; unknown vocab preserved)
- [x] Translated Family (door-style collection) page chrome to ES: collection label, intro, Door/Wood/Finish/Color labels, "Choose your finish", filter tabs (Base/Pared/Altos y Despensa/Tocador/Molduras y Accesorios), search placeholder, not-found state, empty state, "Showing N cabinets" count (with {count}/{name} interpolation)
- [x] Added 26 EN + 26 ES Family keys to site dictionary; updated parity test allowlist (fam_f_base, fam_f_ada, fam_color); 940 tests pass, tsc clean


## SEO audit + improvements (requested)
- [x] Upgrade useSeo hook: manages title (+ " | Cabinet Dealz" suffix), description, OG (og:title/description/type/url/image/site_name/locale), Twitter card tags, canonical link, and <html lang> (EN/ES); restores prior values on unmount
- [x] Add base OG/Twitter tags + theme-color + favicon + 1200x630 OG image to index.html
- [x] Add favicon (brand CD monogram SVG) + apple-touch-icon referenced from index.html
- [x] Per-route SEO: Home, Catalog, Styles (DoorStyles), Packages, Countertops, DesignTool, ProNetwork, PlanSheet, Cart, SignIn, NotFound
- [x] CabinetDetail + Family + PackageDetail: dynamic titles/descriptions from live data (translated spec name / style name / package name; no hardcoded SKU counts); og:type=product on product pages
- [x] robots.txt (dynamic, server/seo.ts): allow public crawl, disallow /cart /checkout /signin /admin /account /api/; Sitemap line uses live host
- [x] sitemap.xml (dynamic, server/seo.ts): stable public routes + every active door-style family (DB-driven, deduped, XML-escaped); absolute URLs from live host
- [x] Removed public "Showing N cabinets" count -> count-free "Cabinets available in {name}" (per no-SKU-count SEO guidance)
- [x] Bilingual SEO copy (EN+ES) for all meta; og:locale toggles en_US/es_ES
- [x] Tests (server/seo.test.ts, 4) + tsc clean + verified robots/sitemap via curl + static head via curl; full suite 942 pass
- [ ] FOLLOW-UP (post-publish): update sitemap/canonical confirmed against final custom domain; submit sitemap to Google Search Console


## SEO: Structured data (JSON-LD) for rich snippets
- [x] Build a pure jsonLd helper module (buildProductJsonLd / buildPackageJsonLd) with unit tests (client/src/lib/seo/jsonLd.ts; 7 tests)
- [x] Extend useSeo to inject/cleanup a <script type="application/ld+json"> tag (single or array; stable via stringified key; removed on unmount)
- [x] CabinetDetail: emit Product JSON-LD (name, description, brand Cabinet Dealz, image, sku/mpn, url, category) — NO Offer (tier/member-gated pricing intentionally not published). Verified in live DOM (DB-12-3)
- [x] PackageDetail: emit Product JSON-LD with Offer (suggestedRetail price, priceCurrency USD, availability InStock, url). Verified in live DOM (l-shape-10x10: price 3330.33 USD InStock)
- [x] Validate JSON shape via tests (949 pass) + tsc clean + headless Chromium DOM dump of both page types; checkpoint


## Designer Base tab: ordered accordion subgroups
- [x] Added pure baseSubGroup() classifier (base / drawer / sink / specialty) in cabinetGraphics.ts with unit tests (33 tests)
- [x] DesignTool groupedPalette: Base tab splits into 4 ordered accordion subgroups -> Base, Drawer Bases, Sink Bases, Specialty Bases (collapsible like other groups). Full-height bases (B-*FH) stay in the regular Base group per user.
- [x] Added EN/ES i18n labels for the 4 base subgroups
- [x] Tests + tsc + verified in designer (BASE CABINETS (15) leads, FH bases included); checkpoint


## Designer Corner tab cleanup
- [x] Angled Wall (AW-*) cabinets must NOT appear in the Corner tab; moved to the regular Wall tab (diagonal/angled canvas rendering left intact via isDiagonalCorner)
- [x] Added exported isAngledWallCabinet() helper (design.ts); isCornerWall excludes it, Wall tab (!isCornerWall) includes it
- [x] Kept true corner units in Corner tab (DCW diagonal, blind/lazy-susan, easy-reach ERB/BER, RHC corner range hood with isCornerCabinet=1)
- [x] Tests added (design.test.ts: AW=angledWall true, cornerWall excluded, still diagonal-rendered) + tsc clean + full suite 961 pass; checkpoint


## Catalog placement audit (winding-down QA)
- [x] Audited all 400 cabinets against the live server placement normalization + client tab filters
- [x] Verified 0 placeable cabinets land in NO palette tab (nothing invisible)
- [x] Tab distribution sane: Base 89, Vanity 53, Corner 41, Wall 108, Tall 33, Accessory 76 (=400)
- [x] Corner tab contains only true corner units (blind BBC/WBC, diagonal DCW/WD, easy-reach ERB/WER, lazy susan LSB, corner sink CSB/UV-SBF, corner range hood RHC); no angled-wall (AW) leakage
- [x] Vanity tab populated with all genuine vanities (V-*, VB-*, VS-*, VDB-*, VA-*, BFH-* full-height vanity sink, ADA-VS/VDB); confirmed NOT empty
- [x] Tall tab correct: oven/microwave towers, pantry/utility, split-pantry top+bottom (24" deep) — split-pantry tops correctly NOT in Wall
- [x] ADA bases (placementType "ada base") normalize to Base; sort into Specialty (18) + Sink (11); ADA vanity-sink route to Vanity tab
- [x] Roll-out shelves (RS-*) + end panels stay in Accessories (category=Accessory), not Base


## Mobile Build Sheet declutter (accordion for notes)
- [x] Collapse non-blocking build-sheet notes (finish applied, two-tone summary, Hickory exposed ends, exposed end panels, select-style hint) into one collapsible "Details & notes" accordion, collapsed by default once a door style is picked
- [x] Keep BLOCKING items always visible: conflict warning + range-clearance fix button
- [x] Keep Estimated Total + Export CTA + Pro CTA always visible
- [x] Reuse existing SheetSection accordion + collapsedSheet state
- [x] EN/ES label for the new section; tests + tsc + mobile/desktop verify; checkpoint
- [x] Make "Door Styles & Pricing" color-picker section (Color 1 / Color 2 + pricing tier + explainer) a collapsible accordion too; collapsed by default once a door style is picked, with the active style/color summarized in the header

## Build Sheet notes -> compact icon popover
- [x] Replace the inline "Details & notes" accordion with a small list/info icon button near the Estimated Total that opens a popover/dialog listing the same non-blocking notes
- [x] Icon shows a count badge of how many notes; hidden entirely when there are zero notes
- [x] Keep blocking conflict warning + range-clearance button + Estimated Total + CTAs always visible inline
- [x] EN/ES label for the icon/popover title; tests + tsc + verify; checkpoint

## Corner cabinet (Easy-Reach / Lazy Susan) SKU coverage backfill
- [x] ERB-33, ERB-36, LSB33, LSB36, LSB36ADA only have SKUs for a subset of the 62 door styles, so they disappear from the Corner tab for styles they lack
- [x] Backfill missing distributor_skus for these 5 cabinets across all active door styles, copying each cabinet's existing price (wholesale/contractor/list/etc.) so they appear on every style
- [x] Verify in DB each of the 5 now has 62 available+published styles; spot-check designer Corner tab

## Tawk.to live chat go-live
- [x] Set VITE_TAWK_PROPERTY_ID (6a3ea71335bb181d4aa8b755) and VITE_TAWK_WIDGET_ID (default) from owner's embed snippet
- [x] Validate embed URL resolves to a real Tawk widget (HTTP 200 + account key echo) via vitest server/tawk.config.test.ts
- [x] Restart dev server so the chat launcher loads the live widget

## Remove Kitchen Packages feature (per owner: people don't buy 10x10 kitchens)
- [x] Chat: change suggested prompt "Help me plan a 10x10 kitchen" -> "Help me design my kitchen" and fix \u2026 escapes in ChatWidget
- [x] App.tsx: remove Packages + PackageDetail lazy imports and /packages routes
- [x] TopNav.tsx: remove nav_kitchen_packages link
- [x] DesignTool.tsx: remove ?package=slug preload (packageSlug, packages.layout query, preload effect, error effect, draft-restore guard)
- [x] Delete pages Packages.tsx and PackageDetail.tsx
- [x] server/routers.ts: remove packagesRouter wiring; delete server/routers/packages.ts
- [x] shared/packages.ts: delete; server/packages.test.ts: delete
- [x] seo.ts: remove /packages sitemap entry; jsonLd.test.ts dropped package tests; removed buildPackageJsonLd
- [x] assistant.ts: remove "Kitchen Packages" from guidance copy
- [x] i18n/site.ts: package nav + pkd_* keys left as harmless unused strings (not rendered anywhere)
- [x] tsc clean + full vitest suite green (958 tests)

## Designer mobile fixes (from screenshot)
- [x] Sink object placed on canvas cannot be deleted - mobile Delete + keyboard Delete/Backspace now delete a selected sink; selection is mutually exclusive (cabinet/sink/opening)
- [x] No visible link/list to review & purchase placed cabinets - added itemized cabinet list (with color) + primary "Add all to cart" button that pushes the design into the cart and routes to /cart
- [x] Dragging a cabinet near another now snaps/butts against it and stops, not overlap/collide (overlap push-out added to snapPosition; 3 new vitest cases)

## Adjustable Ceiling Height (user request: people go from ~8 ft to ~11 ft, even pitched)
- [ ] Add `ceilingHeight` (inches) to RoomData model + clamp range (e.g. 84"\u2013144"), default 96"
- [ ] Persist ceilingHeight in design.save / load (DB column or JSON), backward-compatible default for old saves
- [ ] Add adjustable Ceiling Height control (feet + inches) to the designer toolbar/room controls; EN/ES labels
- [ ] Front/elevation view draws the wall to the real ceiling height (shows space above wall cabinets)
- [ ] Fit warnings: crown / stacked uppers / tall pantry exceeding ceiling get flagged
- [ ] (Optional) sloped/vaulted ceiling note or per-wall height if feasible
- [ ] tsc + vitest (clamp + fit-check helpers) + screenshots; checkpoint

## Adjustable Ceiling Height (already largely built; surfaced + warnings)
- [x] ceilingHeight already in RoomData with presets, 84-144" clamp, roomCeiling() helper, default 96"
- [x] Adjustable Ceiling control already exists in Room popover (custom value 84-144" + 8/9/10 ft presets) - covers 8 ft to 11 ft
- [x] ElevationView already draws wall to roomCeiling(room); uppers pushed up by wallCabinetTopLine
- [x] Surface ceiling height on the Room button label (EN/ES)
- [x] Add ceilingFitViolations helper + warn when cabinets (tall pantry / stacked uppers + crown) exceed the ceiling
- [x] Tests added (roomCeiling, ceilingFitViolations); tsc clean; full suite green (966 tests)

## End panels: only Hickory needs a skin (per user)
- [x] Stop auto-adding finished end panels to the build sheet for non-Hickory styles (autoEndPanels now always empty)
- [x] Remove the "Exposed ends: N finished end panels auto-added" build-sheet note
- [x] Reword the optional decorative end-panel suggestion as purely cosmetic ("ends already come finished")
- [x] Reword OrderReview decorative end-panels blurb to cosmetic-only
- [x] Hickory skin auto-suggest left untouched (only style with unfinished exposed ends)
- [x] tsc clean + full suite green (966 tests)

## Designer: remove Export Build Sheet (CSV)
- [x] Remove the "Export Build Sheet (CSV)" button from the designer estimate panel (redundant now that "Add all to cart" handles ordering)
- [x] Remove unused exportBuildSheet + Download imports (kept buildSheetCsv helper + its tests, still valid)
- [x] tsc clean + full suite green (966 tests)

## Freight origin: ship from nearest distributor warehouse (not fixed ZIP)
- [ ] Freight currently uses single shippingSettings.originZip; switch to per-shipment origin = nearest distributor warehouse (distributors.warehouseZips), keyed by customer ZIP
- [ ] Use existing nearestWarehouseMiles helper to pick the closest warehouse ZIP for the order's distributor
- [ ] Fall back to global originZip only when a distributor has no warehouse ZIPs
- [ ] Multi-distributor orders compute freight per origin warehouse
- [ ] Tests for nearest-warehouse origin selection; tsc + full suite green

## Two-tone "family" rule (same distributor) + out-of-family warning
- [ ] When picking Color 1 + Color 2, prefer a single distributor that carries BOTH styles
- [ ] If Color 2 is only available from a different distributor than Color 1, show a warning in the designer: going outside the family may add extra shipping
- [ ] EN/ES warning copy; tests; tsc + full suite green; checkpoint


## Phase N: Freight origin + two-tone warning + corner 3D
- [x] Add pickNearestWarehouseZip helper to shared/availability.ts
- [x] Wire nearest distributor warehouse as freight origin (live mode) in server/routers/freight.ts (resolveOriginZip + resolveCartDistributorId, optional distributorId input)
- [x] Two-tone "family" rule warning in DesignTool when Color 1 / Color 2 come from different distributors (EN/ES i18n)
- [x] Flat-shaded depth cues (directional shading + seam contact shadow + floor plane) added to CornerView — lightweight, no perspective/3D math (option 3)
- [x] tsc clean + full test suite passing (87 files, 971 tests)
- [x] Checkpoint (version 049cba49)


## Corner view enhancements (June)
- [x] Strengthen CornerView depth cues (deeper seam shadow, stronger directional wall shading, floor plane + contact line, ceiling shade)
- [x] Render corner cabinets (lazy Susan / diagonal corner / WDC / blind corner) straddling BOTH walls at the seam in Corner view — added seamCabinets prop to ElevationView (renderCabinetBox helper, pinned to corner end posAlong 0); CornerView computes corner cabinets seated at the viewed corner via cornerRotationForPlaced and injects seam ghosts into the non-owning half. tsc clean; verified live with LSB36 showing on both walls
- [x] Verify both-sides corner rendering in live designer + checkpoint
- [ ] Make Corner view read as TRUE 3D: CSS perspective with both walls converging to a vanishing point at the seam, tapered floor + ceiling planes (lightweight, no 3D engine)

## Active bugs (2026-06-26)
- [x] Placed base cabinet (e.g. B-18) mis-labeled "accessory / trim" FIXED — PlacedCabinet now carries category/subCategory (stamped in addCabinet + auto-fill); selected preview shows "1-door cabinet". Regression test added; 979 tests pass.
- [x] Designer palette search box: verified WORKING in latest build (typing "B-24" filters to 24" matches). The reported failure was the OLDER published build — fixed by republishing.

## Active bugs (2026-06-26 #2)
- [ ] Base cabinet DEPTH: placed bases are forced to 24" deep; some bases are genuinely 12" deep (and other specialty depths). Use each cabinet's real catalog depth at placement, not a hardcoded 24".
- [ ] Cabinets disappearing in the designer: ensure placement NEVER drops/hides a cabinet (off-canvas coords, NaN, overlap-skip). Always place visibly on the active wall.

## Depth + disappearing fix (2026-06-26)
- [x] Audited catalog base depths; found bad data: BS-24-35=0.75", VA-30/36/42=3"
- [x] Corrected DB depths: BS-24-35 -> 24", VA-30/36/42 -> 21" (vanity standard)
- [x] Confirmed genuine 12" bases (SPB-6/SPB-9) correctly stay 12"
- [x] Hardened placedFootprint: 6" minimum visible floor for real cabinet boxes (panels/fillers exempt) so nothing can vanish from bad data
- [x] Added 7 regression tests for depth + sliver floor; full suite 986 passing

## Per-wall / sloped ceiling height (2026-06-26)
- [ ] Extend RoomData with optional per-wall ceiling heights (back/left/right/front), each supporting a high+low value for slopes; fall back to single ceilingHeight
- [ ] Add helpers: resolve a wall's ceiling line (flat or sloped), keep roomCeiling() as global fallback
- [ ] Render per-wall/sloped ceiling line in ElevationView (Front View) using the active wall's heights
- [ ] Render sloped ceiling plane in CornerView for each of the two walls
- [ ] Update wallCabinetTopLine + ceilingFitViolations to respect per-wall ceiling (use the wall's low point)
- [ ] Add per-wall ceiling controls to RoomSizeControl (flat height + optional slope high/low per wall)
- [ ] Add regression tests for per-wall ceiling resolution + fit checks
- [ ] Verify in browser (Front View + Corner View show slope), run full test suite, checkpoint

- [x] Per-wall / sloped ceiling: model, render (Front+Corner), UI controls, fit checks, tests (994 passing)

## Stale-cache safeguard (2026-06-27)
- [ ] Add client-side version check that polls /__manus__/version.json (or build version) and prompts/auto-reloads on new build
- [ ] Ensure index.html is served no-cache (verify) and bundles are content-hashed (verify)
- [ ] Verify the reload prompt appears when version changes

## Door-style picker scroll fix (user report: can't pan past first ~10 styles)
- [x] ColorSlotButton picker: taller viewport-bounded list (max-h min(60vh,420px)) + touch-pan-y/overscroll-contain/WebkitOverflowScrolling so the full A→Z list scrolls on mobile. Verified Aero Alba … Zephyr Sage all reachable.

## REOPENED: door-style picker still capped at ~10 on real phones (Firefox, 2 devices)
- [x] Reproduced: confirmed only ColorSlotButton picker exists; on mobile the Popover scroll gesture is captured by the canvas so only ~10 rows are reachable
- [x] Fix: ColorSlotButton now opens the door-style list as a full-width BOTTOM SHEET on mobile (useIsMobile(1024)) with native touch scrolling + sticky header; desktop keeps the Popover
- [x] Typecheck clean + 1000 tests pass; checkpoint saved for phone testing

## RESOLVED: base cabinets disappear after selecting a door style (Firefox + Chrome, after picker fix)
- [x] Reproduced: picking a style into the NON-active color slot left active styleId null, so the style-filtered catalog returned nothing -> looked empty
- [x] Fixed in DesignTool.setSlotStyle: the first style pick for any slot now activates that slot AND sets styleId, so the catalog always populates
- [x] Verified live: picking Aero Alba sets active slot + shows its full lineup (28 base-placement items across sub-groups: Drawer Base 17, Roll Out 7, Sink 3, Single Door Base 2, etc.). Regular B-series isn't carried in that finish (data reality, not a bug). 1000 tests pass.

## Per-style availability hint + lineup confirmation (user request)
- [ ] Add a clear "X of Y cabinets available in this style" hint in the designer catalog header (shown once a style is selected)
- [ ] Make the hint subtle/non-alarming; explain that each finish has its own lineup
- [ ] Add unit test for the availability-count logic
- [ ] Verify in browser (style with full lineup vs Aero Alba's smaller lineup), checkpoint
- [ ] FOLLOW-UP (needs user): confirm whether Aero Alba (and similar styles) should carry the standard B-series bases — if yes, it's a missing-SKU data fix


## Per-style availability hint (user request)
- [x] i18n strings dt_pl_avail_count / _one / _lineup_note (en+es)
- [x] availableInStyleCount memo (counts full lineup for the active style per tab, ignores search)
- [x] Render hint line under search box when a style is selected (verified live: "28 cabinets available in Aero Alba — Each finish has its own lineup.")
- [x] Verified in browser

## Catalog thumbnails / door swatches blank on live (mobile) — user report "photograph don't working"
- [x] Diagnosed: NOT broken links. The 61 door-sample photos averaged 3.4 MB each (up to 5 MB), total ~204 MB. Catalog/Door-Styles pages load many at once -> phones (cellular) show blank squares / never finish. Cabinet line-art images were fine (300 imgs, avg 7 KB).
- [x] Fix 1: optimized all 61 door photos with Pillow (resize max 900px long edge, progressive JPEG q82) -> avg ~22 KB; total 204 MB -> 1.55 MB. Repointed door_styles.doorSampleImageUrl to the new _opt keys (61/62; 1 is an external CDN webp @ 359 KB, already small).
- [x] Fix 2: storage proxy Cache-Control changed from no-store to public/max-age=86400+SWR so images are cached and not re-downloaded every scroll/visit.
- [x] Verified optimized images serve 200 image/jpeg (~52-63 KB) with cacheable headers; designer catalog renders door swatches. 1000 tests pass.
- [x] Added storageProxy.test.ts (asserts cacheable header + redirect); 1001 tests pass
- [x] Checkpoint + advise publish

## Become a Vendor (all home-remodel categories — user request)
- [x] vendor_applications table + vendor router (submit/adminList/adminSetStatus) + owner notification
- [x] Public BecomeVendor page + /become-a-vendor route
- [x] Admin Vendors tab to review applications
- [x] Broadened scope beyond cabinets: category multi-select (Cabinets, Hardware, Countertops, Appliances, Flooring, Lighting, Plumbing/Fixtures, Tile/Backsplash, Doors/Trim, Decor, Other)
- [x] Persist categories on the application + show as badges in admin
- [x] Added "Become a Vendor" nav link (More dropdown; EN+ES i18n)
- [x] server/vendor.test.ts (6 tests) + browser verified; full suite 1007 passing
- [ ] Branded multi-category vendor pitch PDF

## Price Audit: cascading dropdowns + daily picks (user request 2026-06-27)
- [x] Backend: pricing.adminAuditDistributors — distributors that have SKUs, with counts (total / audited / unaudited) so the owner can pick the original distributor by name
- [x] Backend: pricing.adminAuditStyles({distributorId}) — door styles available for that distributor (id, ourName, styleCode), only styles that have SKUs
- [x] Backend: pricing.adminAuditItems({distributorId, styleId}) — items (cabinets) available for that distributor+style, returning the cabinet + that one SKU + price ladder + audited flag, so no SKU typing is needed
- [x] Backend: pricing.adminDailyAuditPicks — deterministic "4 items a day" rotation of cabinets that are NOT price-verified (stable per calendar day), returns enough to render + verify
- [x] UI: Price Audit tab gets a "Find by dropdown" mode — Distributor select -> Door style select -> Item select -> show editable price ladder + Mark audited + History (reuse SkuRow/VerifyButton/AuditTrail)
- [x] UI: keep the existing search box (queue # / model code) as an alternate path
- [x] UI: "Today's 4 to audit" panel (collapsible cards so they stay scannable) at the top — 4 unaudited items with inline verify, refreshes daily
- [x] Tests: dropdown option procedures + daily picks determinism + admin-only gating (4 tests, 1011 total passing)
- [x] Typecheck clean, full suite passing, verified in preview, checkpoint

## Skyline adjusted-list correction (user request 2026-06-27)
- [x] Back up current Skyline (distributor 3) SKU prices to a timestamped CSV before any change
- [x] Recompute adjusted List = round(yourCost / 0.30, 2) for ALL 6587 Skyline SKUs (yourCost is the trusted anchor)
- [x] Left wholesale/contractor/homeowner UNTOUCHED (owner sets markups off cost on the Markup tab)
- [x] Wrote 6587 cost_change_log entries for each changed listPrice
- [x] Verified W2130-SWO: cost 126.70 -> list 422.33 (cost/list=0.3000); all 6587 rows now at exactly 30%

## Cabinet color/finish rendering fix (user: "get the color cabinet styles to work")
- [ ] Audit real door-style names/colors/finishes in DB; list styles the current matcher mis-colors
- [ ] Rewrite finishColors matcher: scan color/finish field first; stop broad words (dove/pearl/alba/cotton/snow) from forcing white when a real color is present
- [ ] Map every real style to a correct face/edge/label color (validate Skyline Aero ___, Cobalt Abyss, etc.)
- [ ] Unit tests over the real style names asserting expected color family
- [ ] Verify on cabinet detail page (drawing + swatch) and door styles page
- [ ] Full test suite + typecheck green, checkpoint, deliver


## Design Tool two-tone color bug (fix)

- [x] Bug: activating COLOR 2 repaints ALL previously-placed cabinets because slot-A cabinets are stored with styleId=null and inherit the global default
- [x] Fix: stamp every newly placed cabinet (addCabinet, auto-fill, consultant) with the concrete active styleId so it keeps its color when the active style switches
- [x] Fix: default-style change already only recolors cabinets with no explicit per-cabinet style (now far fewer, since placements are stamped)
- [x] Verified Design Tool loads with COLOR 1/COLOR 2 panel; placement now stamps concrete styleId so COLOR 1 cabinets keep their color when COLOR 2 is activated
- [x] Typecheck clean + full suite green (1011 tests, 269 design tests), checkpoint, deliver


## Admin role assignment (Customers panel)

- [ ] Backend: expand customers.setRole to accept user/designer/partner/admin
- [ ] Backend guardrails: cannot change own role; cannot demote the last admin; cannot repurpose distributor/dealer/sales_rep accounts here
- [ ] Backend: when granting partner(affiliate), allow; document that the affiliate record links via userId
- [ ] UI: replace single Make-Designer button with a role dropdown (User / Designer / Affiliate / Admin)
- [ ] UI: confirm dialog when promoting to Admin
- [ ] Tests: role transitions + guardrails (self, last admin, protected roles)
- [ ] Typecheck clean, full suite passing, verified in preview, checkpoint

## Admin: Dedicated Roles Tab
- [x] Create RolesAdmin component (search users, show current role badge, assign Admin/Designer/Affiliate/Member via dropdown + admin-confirm dialog), reusing customers.list + customers.setRole
- [x] Add "Roles" tab to Admin.tsx Tabs (admin-only)
- [x] Typecheck + full test suite green, save checkpoint

## Design Tool: Remove ALL Add-on Sales
- [x] Remove "Don't forget this" recommendation/upsell panel from DesignTool.tsx (was crowding the cabinet list)
- [x] Remove add-on accessory BOM lines (addedAddOns) so quote only contains placed cabinets + structural extras
- [x] Remove addedAddOns state, addAddOn/removeAddOn, addOnPriceFor, findAddOns query, addOnRecommendations usage
- [x] Remove roll-out tray section + props from CabinetAttributesDialog (was an add-on sale)
- [x] Hide loose non-placeable add-on items from Accessories palette; keep placeable physical panels
- [x] Typecheck + full test suite green (1016 pass), save checkpoint

## Design Tool: Lock to one warehouse on first cabinet (no supplier name shown)
- [x] Clarified intent: once the FIRST cabinet is placed, only show options from that cabinet's distributor/warehouse so there are no cross-warehouse shipping charges; do NOT display any company/supplier name
- [x] Add effect to set lockedDistributorId to the selected style's distributor when the first real cabinet (cabinetId > 0) is placed
- [x] Confirmed palette queries + finish picker (uniqueDoorStyles) + Color 2 slot are all scoped to lockedDistributorId
- [x] Removed the distributor-name display query (no name shown)
- [x] Typecheck + full test suite green (1016 pass)
- [x] Typecheck/tests verified; design canvas is behind an email gate so the place-a-cabinet flow was validated via code path + tests; checkpoint saved

## Design Tool: Order base cabinets by width (B12/B15 first)
- [x] Sort placeableCabinets server query by width asc, then masterCode, so each bucket reads small->large (B12, B15, B18...)
- [x] Add matching client-side width sort within each accordion group (base/drawer/sink/specialty, corner, wall/tall by-height, accessory) as a robust tie-break
- [x] Added a unit test asserting the base palette is non-decreasing by width (10/10 placeable tests pass)
- [x] Typecheck clean; full suite green (consult timeout was flaky, passes in isolation), checkpoint
