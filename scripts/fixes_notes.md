# Two Designer bug fixes (in progress)

## User reports (from screenshots)
1. AI 3D render produced a GENERIC L-shaped kitchen with an island, but the user's design is a ONE-WALL galley (single back wall run: W-39-30 / open / W-39-30 uppers; B-30, RANGE-30, B-30, FRIDGE-30 base; window over sink; NO island). Render got style/materials right (white shaker, butcher-block counter, light oak floor) but geometry wrong.
2. The faucet / surfaces picked in the Designer do NOT appear on the shopping list / cart.

## Fix 1: render fidelity (DONE, tests pass)
- shared/photorealPrompt.ts rewritten: layout-aware. New fields on PhotorealPromptInput: layoutType ("one-wall"|"galley"|"L-shaped"|"U-shaped"|"peninsula"|"multi-wall"), cabinetWalls: string[], appliances: string[]. Prompt now states footprint firmly (e.g. SINGLE-WALL), lists ONLY walls with cabinets ("ONLY on the following wall(s): Back wall"), lists ONLY placed appliances ("Do not add any other appliances"), forbids inventing runs ("do NOT invent extra cabinet runs"), and camera clause no longer forces "two adjoining runs of cabinetry". Island only when hasIsland true; when false says "There is NO kitchen island".
- client/src/lib/photorealScene.ts rewritten: computes layoutType from wallsWithCabinets + island, cabinetWalls (human labels), appliances (deduped features across all walls), wallSummaries.
- client PhotorealSceneInput type (PhotorealPreview.tsx) + server input schema (server/routers/design.ts photorealPreview) extended with cabinetWalls/appliances/layoutType.
- server/photorealPrompt.test.ts: 17 tests pass (added one-wall/galley/L/U + appliance-only assertions). Label changed "Layout of the cabinetry:" -> "Exact layout of the cabinetry:".

## Fix 2: surfaces -> cart (code done, needs test + verify)
- Root cause: cartableLines was cabinets + rollout + trim only. selectedSurfaces fed only the render, never became cart lines.
- CartItem shape (client/src/contexts/CartContext.tsx): masterCode,name,styleId,styleLabel,distributorId,tier,unitPrice,qty. Cart LOCKS to ONE distributor (familyLock). Pelican is a different supply line.
- SelectedSurface (SurfacesPickerDialog.tsx): {id,slug,name,category,subCategory?,size?,imageUrl?,sellPrice:number|null}. NO area/qty captured in DesignTool.
- Added surfaceCartLines memo in DesignTool.tsx: masterCode `PEL-<id>`, styleId `-id` (unique, avoids collision), styleLabel = category (+ size), distributorId: null (so cabinet lock never triggers/rejects), unitPrice = sellPrice, qty 1. Skips unpriced. Folded into cartableLines (build sheet at ~3785 + addAllToCart + running total all consume cartableLines automatically).
- TODO next: write a small unit test for surface->cart mapping; verify in browser (add surface, see it on build sheet + /cart); consider follow-up for sqft/box qty (wizard owns area, not DesignTool picker).

## Mobile 3D button (already shipped earlier, checkpoint b08ec3a8)
- "3D View" in mobile bottom bar (7-col), headless PhotorealPreview via controlledOpen, disabled until a non-appliance cabinet placed.

## CRM webhook (shipped, delivery deferred)
- crm_events outbox; emitCrmEvent tags dealer/affiliate; ENV.crmWebhookUrl only valid on http(s); placeholder "design" -> events recorded status "skipped", not POSTed. Owner will set real URL later from a computer.
