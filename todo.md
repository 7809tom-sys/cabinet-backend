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
- [ ] Finish white-label wiring through catalog/design routers + pages
- [ ] Verify in browser + save checkpoint
