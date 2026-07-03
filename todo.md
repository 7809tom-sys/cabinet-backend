
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
