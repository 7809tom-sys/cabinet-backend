# Surfaces & Fixtures wizard + Realistic Preview — build notes

## Approved by user
- POC render approved (Jul 3). Build full flow.
- 34.5" = BASE cabinet height (counter sits on top, ~36" finished). Use for spec math.
- Realistic preview = on-demand AI render using the customer's ACTUAL selected product photos
  as image references (server generateImage with originalImages[]).

## Sandbox reset note (Jul 3)
- Sandbox reset restored code to checkpoint 67a89165. DB NOT rolled back.
- surface_previews table EXISTS in DB (confirmed via SHOW TABLES). Schema def re-appended to schema.ts.
- POC refs survived in /home/ubuntu/poc_refs/ (door.png, floor.png, counter.png, mosaic.png,
  sink.png, faucet.png=749, kitchen_preview_1.png approved render).

## Pelican product schema `pelican_products`
id, pelicanCode, slug, name, description, category(varchar64), subCategory, size,
listPrice, priceTier2/3/4, msrp, tiered, yourCost, markupPercent, isPopular, popularRank,
imageUrl(varchar512 nullable), showInDesigner, showInCatalog, isActive, createdAt.

## Category enum (server/routers/pelican.ts)
"Sinks & Faucets","Flooring","Shower & Bath","Toilets & Bidets","Tile & Mosaic",
"Quartz Slabs (Countertops)","Samples","Marketing & Merchandise"

Wizard steps:
1. Flooring -> "Flooring" (area: sqft -> boxes)
2. Tile & Mosaic -> "Tile & Mosaic" (area: sqft -> boxes) [backsplash]
3. Countertop -> "Quartz Slabs (Countertops)" (design default; 34.5" base)
4. Sinks & Faucets -> "Sinks & Faucets" (pick sink + faucet)

## Pricing helpers (in pelican.ts)
DEFAULT_MARKUP_BPS: Flooring 6500, Tile 5500, Sinks&Faucets 3800, Toilets 3500, Shower 2200, Quartz 1800.
computeSellPrice = cost*(1+bps/10000), cost=yourCost??listPrice.
byCategory pub proc returns items[] each with .sellPrice/.markupBps; scope designer|catalog|all;
also suggested[], total, subCategories[]. bySlug returns single withPricing.

## Box/area math
No sqft-per-box column. Use editable defaults per category in UI:
flooring ~20 sqft/box, tile ~10 sqft/box. boxes = ceil(area*(1+waste)/perBox). waste default 10%.

## Image generation (server/_core/imageGeneration.ts)
generateImage({prompt, originalImages?:[{url?,b64Json?,mimeType?}]}) -> {url} (/manus-storage/..).
storageGetSignedUrl(relKey) -> absolute https URL (strip leading "/manus-storage/").
Preview endpoint: take selected products' imageUrl -> signed URLs -> originalImages -> return render url.

## Existing frontend (survived restore)
Surfaces.tsx, SurfacesCategory.tsx, SurfacesProduct.tsx, lib/pelican.ts, pelican/PelicanProductCard.tsx.
Routes /surfaces, /surfaces/product/:slug, /surfaces/:slug. Homepage SurfacesBand.
vendors.ts router exists. pelican.ts router 294 lines.

## Build plan (phase 2-4)
1. pelican.previewKitchen mutation (publicProcedure): input selected product ids/slugs +
   optional doorStyleImageUrl; gather imageUrls -> signed urls -> generateImage -> save row in
   surface_previews -> return {url, id}. Cap refs ~6, skip null images.
2. SurfacesWizard page (route /design-surfaces or /surfaces/build): 4 steps, sqft input + box calc,
   running total, final "Generate Realistic Preview" -> show render + "Continue to design".
3. Carry selection into DesignTool via localStorage key 'cd_surface_selection'.
4. Entry points: hero + SurfacesBand "Design with these" button, and Surfaces landing CTA.


## PROGRESS (this session)
- surfaces router registered in server/routers.ts as `surfaces` (byIds + previewKitchen). Typecheck clean. Live test OK.
- surface_previews DB table confirmed: id, ownerOpenId, selections(json), previewUrl, createdAt.
- NEW files:
  - client/src/lib/surfaceSelection.ts (SurfacePick/SurfaceSelection types, localStorage key `cd_surface_selection`, computeBoxes, guess*MaterialId mappers)
  - client/src/components/surfaces/StepProductGrid.tsx (product picker grid per step)
  - client/src/components/surfaces/AreaCalculator.tsx (sqft->boxes math UI)
  - client/src/pages/SurfacesWizard.tsx (4-step wizard + preview step)
- Routes registered in App.tsx: /design-surfaces AND /surfaces/build (both -> SurfacesWizard), placed BEFORE /surfaces/:slug.
- Wizard preview example image uploaded: /manus-storage/wizard_preview_example_f9579597.png
- Design Tool consumes: countertopMaterialId, backsplashMaterialId, flooringMaterialId (design.ts material ids), selectedSurfaces state (SelectedSurface[]). /design gated by EmailGate (verified state).
- TODO next: (1) wire entry points (Surfaces landing CTA, homepage SurfacesBand button) to /design-surfaces; (2) make DesignTool read cd_surface_selection on mount to pre-select materials + selectedSurfaces; (3) tests + checkpoint.
