# Recommended Pelican Surfaces in Designer — implementation notes

## Goal
Replace the generic built-in FLOORING_MATERIALS / BACKSPLASH_MATERIALS swatch
palettes (and generic countertop material options) in the Design Tool with a
short curated set of RECOMMENDED real Pelican products, added as their own
sections in the LEFT PALETTE next to Base/Wall/Tall/Appliances. Roles: flooring,
backsplash, countertop, sink, faucet. Each ~6-8 items, real photo + price, tap to
select, "Browse all" link into the full SurfacesPickerDialog. Countertop IS now
included (user expanded scope). Selecting an item adds it to `selectedSurfaces`
(hits cart via surfaceCartLines + satisfies 3D View gate via surfaceRole).

## Real Pelican categories (DB `pelican_products.category`)
- Flooring (subCategory: "Planks & Flooring"=89, "Moldings & Trim"=162 EXCLUDE, "Underlayment"=1)
- Tile & Mosaic (Mosaic=43, Tile=8)  -> backsplash
- Quartz Slabs (Countertops) (Quartz Slab=35) -> countertop
- Sinks & Faucets (Sinks=297, Faucets=113, "Sink & Faucet Accessories"=180 EXCLUDE, "Disposals & Accessories"=21 EXCLUDE)
- Shower & Bath, Toilets & Bidets, Samples, Marketing & Merchandise (not used)

## Server: surfaces.recommended query (DONE)
File: server/routers/surfaces.ts
- New procedure `recommended({ role: flooring|backsplash|countertop|sink|faucet, limit=8 })`
- roleFilter(): flooring=Planks&Flooring only; backsplash=Tile&Mosaic; countertop=Quartz; sink=Sinks; faucet=Faucets
- Requires isActive, showInDesigner, imageUrl present; orders popular-first, popularRank, name
- Over-fetches limit+12, drops accessory names (regex clip/strainer/grid/template/mounting/...), slices to limit
- Returns { id, slug, name, category, subCategory, size, imageUrl, sellPrice }
- Registered already: server/routers.ts -> surfaces: surfacesRouter

## SelectedSurface type (client/src/components/design/SurfacesPickerDialog.tsx)
{ id, slug, name, category, subCategory?, size?, imageUrl?, sellPrice }
- toggleSurface(item) in DesignTool adds/removes from selectedSurfaces (line ~308)

## surfaceRole helper (client/src/lib/pelican.ts) — single source of truth
maps category(+subCategory) -> flooring|countertop|backsplash|sink|faucet|other
Used by renderReadiness memo (DesignTool ~3395) and should drive render fills.

## Built-in swatches to remove/replace (client/src/lib/design.ts)
- BACKSPLASH_MATERIALS (11) ~line 3213, backsplashMaterial()
- FLOORING_MATERIALS (11) ~line 3247, flooringMaterial()
- backsplashMaterialId / flooringMaterialId state in DesignTool ~lines 330-332
- Mobile sub-sheets render these ~lines 3874-3976 (flooring & backsplash sheets)
- guessBacksplashMaterialId used ~line 3314 when a surface pick handed off
- Elevation/plan rendering uses backsplashMaterial()/flooringMaterial() fills
- countertop is a boolean toggle + countertopMaterialId (COUNTERTOP_MATERIALS)

## Palette tabs (DesignTool ~line 326)
paletteType union: base|vanity|corner|wall|wallht|tall|appliance|opening|closetparts|accessory|furniture
=> add surface sections. Plan: add a "surfaces" palette entry OR dedicated
sections. Simpler: add new tab value(s) and render RecommendedSurfacePicker.

## Component to build
client/src/components/design/RecommendedSurfacePicker.tsx
props: role, selectedIds:Set<number>, onToggle(SelectedSurface), onBrowseAll()
uses trpc.surfaces.recommended.useQuery({role, limit}); grid of photo+name+price;
selected highlight + check; "Browse all" button opens SurfacesPickerDialog.

## Cart / gate wiring (already works via selectedSurfaces)
- surfaceCartLines memo (DesignTool ~1380) -> buildSurfaceCartLines
- renderReadiness memo (~3395) uses surfaceRole on selectedSurfaces
- So as long as picks land in selectedSurfaces, cart + 3D gate work.

## Tests
- server: add surfaces.recommended test (role filters, accessory exclusion, priced+photo only)
- client: pelican.test.ts already covers surfaceRole
- Keep full suite green; tsc clean; then checkpoint.
