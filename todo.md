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
- [ ] Canvas room builder (draw walls with tape-measure tool)
- [ ] Cabinet placement from catalog onto canvas
- [ ] Style application to placed cabinets
- [ ] Cabinet front-elevation graphics rendering per style
- [ ] Save/load kitchen design
- [ ] Export design to cart

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
