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
