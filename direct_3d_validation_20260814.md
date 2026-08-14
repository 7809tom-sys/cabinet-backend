# Direct Active-Design Validation — 2026-08-14

- Browser route inspected: `https://3000-ii064d10drv7ohufp413i-0db19c20.us2.manus.computer/design?load=8190001`
- Saved design: **Aspin**, 20 placed items, room shown as **12' × 12'1"**.
- The persisted style record now restores in the live designer: **Aspen White** (style ID `330001`, distributor ID `210001`), and the 2D palette shows its sample image.
- The current 3D modal reports 20 cabinet items and uses the restored catalog finish instead of a no-style empty state.
- Priority remaining user-reported geometry is limited to **corner cabinets and appliances**. The active plan includes `CDB36`, `WDC2442`, `RANGE-30`, `HOOD-30`, `MW-30`, `DW-24`, and `FRIDGE-36`.
- The active-plan sync summary currently reports no separately persisted openings, sinks, island, furniture, or pony walls for this design.
- Direct 3D inspection now shows a white Aspen kitchen with the range, refrigerator, microwave, drawer runs, and a visible L-corner form. The preview correctly reports 20 placed cabinets, matching the 2D designer; the separate 24-item figure belongs to pricing lines and is not a scene-count mismatch.
- The remaining comparison priority remains the CDB36 corner outline and appliance geometry, particularly range/hood and the appliance run.
Resolved WDC2442 parity rule: the saved record’s null `cornerType` is normalized from its `WDC` master code before scene construction, producing the shared 24-inch diagonal footprint and diagonal specialty-face path rather than a stale rectangular fallback.

## Source-plan collision repair — 2026-08-14

- The prior **2 items in conflict** warning was a real one-inch floor-plan overlap, not a 3D-only issue: the rotated `B-33` ran from `y=75` through `y=108`, while `FRIDGE-36` began at `y=107`.
- The saved plan was repaired by snapping `FRIDGE-36` to the exact adjoining run edge at `x=0.75`, `y=108`; this preserves the design, removes the physical overlap, and keeps the adjacent refrigerator return panel untouched.
- Reloading the same saved plan with `7809tom@gmail.com` showed no appliance-to-cabinet conflict notice.
- The deterministic preview opened from the repaired plan and reported **20 cabinets from the current design**, matching the persisted 2D count. Its scene summary also retained `0` separately saved openings, sinks, island, furniture, and pony walls for this specific plan.
- The current 3D countertop eligibility rule now delegates to the same `bearsCountertop` contract as the 2D elevation: regular counter-bearing bases and `DW`/`WINE` openings support a slab, while `RANGE`, `FRIDGE`, `HOOD`, `MW`, `OVEN`, fillers, panels, walls, and tall units do not.
- The saved appliance snapshot contains `MW-30` at `x=0`, `y=45`, height `17`, mount bottom `54`, and `HOOD-30` at `x=3.5`, `y=45`, height `18`, mount bottom `66`. Their stored mounting envelopes overlap by five inches; this is retained as a source-plan fact for the next parity pass rather than silently changing appliance placement in 3D.
- The live renderer now builds `WDC2442` as a clipped 45-degree triangular carcass and a matching clipped countertop slab from the same 24-inch diagonal plan footprint, rather than rendering a rectangular corner mass. The active 20-item 3D scene was reloaded after this update for visual verification.

## Current-checkpoint visual pass — 2026-08-14

- Reloaded design `8190001` under `7809tom@gmail.com` after the room-aware vertical transform update. The 2D plan remains a **20-item** kitchen with no appliance-to-cabinet collision warning.
- The user-facing deterministic modal reports **20 cabinets from the current design** and shows the active selected material as **Aspen White cabinets · Quartz countertop**.
- In the direct full-screen scene, the refrigerator, range with physical cooktop, stacked over-range microwave and hood, dishwasher opening, supported countertop run, and adjoining corner runs were all present from the same persisted plan.

## Representative-plan validation — 2026-08-14

- Loaded saved design `7230001` (**Blue and white**) without editing it. Its 2D designer reported **21 items** in a `12'7" × 10'` room and included a different cabinet mix: `ERB-36`, `FSB-36`, `DW-24`, `RANGE-30`, `FRIDGE-30`, `MW-30`, and varied short, deep, and diagonal wall cabinets.
- The same deterministic renderer reported **21 cabinets from the current design**, matching the non-active 2D count. It rendered the saved layout with no dependency on the active Aspin corner or appliance configuration.
- This representative record has no active door sample; the renderer intentionally displayed its documented calibrated fallback rather than an empty room, while retaining the loaded 2D cabinet layout.

## Persisted-surface handoff confirmation — 2026-08-14

- After adding the shared selected-countertop color handoff and scene-revision input, reloaded active design `8190001` again. The live 2D plan remains at **20 items**, restores **Aspen White**, and preserves the saved `12' × 12'1"` room.
- The deterministic preview now receives the same selected 2D countertop color as its initial scene material unless the user has explicitly stored a presentation-only override; a persisted countertop selection also participates in the scene rebuild signature.

## Presentation-sync stability confirmation — 2026-08-14

- The preview action briefly exposed a React maximum-update-depth fault after the persisted-material handoff. The 3D presentation callback is now guarded so an unchanged cabinet/countertop pair is emitted only once, and initial finish synchronization is value-stable.
- Reloaded `8190001` after the guard, opened the live deterministic modal, and confirmed it remains mounted: it reports **20 cabinets from the current design** with the current 2D entity inventory, visible CDB36/WDC corner forms, range cooktop, mounted appliance run, refrigerator, drawer bases, and selected Aspen finish.

## Published full-screen scene check — 2026-08-14

- Reopened the deployed active design after checkpoint `37d182d1` and expanded its deterministic preview. The canvas remained stable after entering full screen.
- The large rendered view showed physical Shaker door and drawer framing, the range cooktop and oven at the counter run, the mounted over-range appliance stack, refrigerator enclosure, supported countertop breaks, and the cabinet run without a blank scene or repeat-render failure.

## Responsive deterministic-preview route — 2026-08-14

- Added a guarded `preview=3d` route input that opens the same deterministic modal only after the saved 2D plan and catalog scene are ready; it is used for repeatable narrow-viewport validation and does not create an alternate renderer.
- A `375px` mobile capture opened the active plan’s responsive 3D modal, retained its **20 cabinet** plan-sync inventory, and reported the selected door texture as loaded. A tall capture correctly displayed the non-blocking catalog-geometry loading state while the same saved plan hydrated.
