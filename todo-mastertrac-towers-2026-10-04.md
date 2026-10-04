# MasterTrac connected-tower planning — session checklist (2026-10-04)

- [x] Re-read Designer, geometry, workbook, and WebDev skills; inspect current b9ba6257 checkpoint and owner screenshot.
- [x] Audit 2022 customer-safe catalog: floor left/center/right uprights in matching finish, exact 87/94-in heights and 14.5/23.5-in depths; matching straight adjustable-shelf SKU widths. Do not substitute 2026 finishes, quantities, or pricing.
- [x] Implement pure 2–4 bay shared-upright planner using one left end, one right end, and one center board per join. The clear opening equals the selected actual shelf width; each SKU retains workbook dimensions and List reference price.
- [x] Guard ceiling, wall span, doors/windows, missing/mismatched SKUs, existing-cabinet collisions, and shelf elevation; reject the entire group instead of partially placing it.
- [x] Put an obvious Connected towers entry point in the existing Closet tab; support finish, bay widths, wall location, and per-bay shelf positions with a dimensioned visual layout and a dated, non-checkout List subtotal.
- [x] Verify one-action undo, saved-layout reload, separate 2D/3D board rendering, independent shelf movement, and unchanged checkout/Continuous Wall Builder behavior.
- [x] Run TypeScript, focused and affected suites, production build, and local browser interaction; compare full-suite failures to the saved baseline (102 pre-existing, zero new).
- [ ] Save a managed checkpoint, recover the dev preview if needed, and verify the selector on the requested live site before reporting it visible there.

**Boundary:** This is a board-level planning layout, not manufacturer installation engineering. No fabricated connectors, holes, rods, drawers, doors, corner boards, installation assurance, or current supplier checkout price. The owner's 2022 workbook remains the SKU and price authority; the 2026 Sauder spec book is secondary role/visual evidence only.
