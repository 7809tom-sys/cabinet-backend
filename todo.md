
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
