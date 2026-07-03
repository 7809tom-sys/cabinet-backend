
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
