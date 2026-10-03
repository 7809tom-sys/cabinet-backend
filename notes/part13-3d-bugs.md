# Cabinet Dealz – Part 13 3D rendering bugs (working notes)

Project: /home/ubuntu/cabinet-dealz (webdev project DQ7pUcbPFvKvFZ8JnyMs4M), live at https://www.cabinetdealz.com
User's screenshot: /home/ubuntu/upload/Screenshot2026-10-03084355.png (crops: /tmp/crop_fridge.png, /tmp/crop_corner.png)
Reproduction design: kitchen_designs id 11790001 "carbon frost 12x16" (room 192x144, ceiling 96). Dumped at /tmp/designs.json.
  - ERB36 at x156 y0 rot90 wall right (L-corner base), WER2442 wall corner, FRIDGE-36 x24 h70, bridge WR3624 mountBottom 72 h24 (top 96 = ceiling), W-2442 at x60 next to bridge.
Injection JS for browser (localStorage draft, email qa-render-check@cabinetdealz.com): /tmp/inject2.js
  key: cabinet-dealz:designer-draft:v2:owner:qa-render-check@cabinetdealz.com ; active key cabinet-dealz:designer-draft:active:v2:owner
Browser hit crash-loop cooldown at ~08:58 CDT (10 min retry).

## Diagnosis
BUG 1 (corner countertop): `lCornerCountertopWorldPolygon` in client/src/lib/design.ts returned the full SQUARE bounding box (36x36) for cardinal rooms — not the true L footprint. Also `addCabinet` per-cabinet path used BoxGeometry(bodyWidth x bodyDepth). Result: a 36x36 slab plug with no front overhang, protruding ~10.5" into the floor beyond neighbouring 25.5" run slabs.
BUG 2 (crown through bridge): `isCrownEligibleCabinet` in design.ts excluded refrigeratorAssemblyRole === "bridge" when its top was within 3" of the ceiling; `threeDCrownPerimeterSegments` (InteractiveRoom3D.tsx) only used crown-eligible cabinets as footprint blockers, so the W-2442 neighbour's left-return crown ran to the wall THROUGH the bridge body; bridge got no crown. Crown height per cabinet is already correct (each cabinet's own elevationBox top) — the bug was eligibility/blocking, not height.

## Fixes (done)
- design.ts lCornerCountertopWorldPolygon: always return 6-pt L with front overhang on both exposed fronts.
- InteractiveRoom3D.tsx addCabinet l-corner branch: lCornerCountertopWedgeGeometry(bodyWidth, bodyDepth, 1.5*INCH, lCornerLegRatio); userData exactLCornerCountertopGeometry true.
- design.ts isCrownEligibleCabinet: bridge no longer excluded; new export crownBlockingCabinets(placed, room) = eligible + all wall/tall bodies (non-island).
- InteractiveRoom3D.tsx threeDCrownPerimeterSegments: footprints from crownBlockingCabinets. Import added line 15.
Verified: diag shows bridge crown front (24..60, z24) + right-return at x60; ERB36 top poly [[36,0],[36,36],[10.5,36],[10.5,25.5],[0,25.5],[0,0]].

## Tests
Baseline had 77 pre-existing FAIL lines (/tmp/fail_before.txt); after change 87 (/tmp/fail_after.txt). 10 new = old-rule tests to update:
- design.test.ts: "covers the complete LSB36 cabinet top..." (~1966), "keeps a Lazy Susan top inside both cabinet-supported legs..." (~1984), it.each "keeps the complete L-corner countertop aligned at N degrees" (2042)
- InteractiveRoom3D.test.ts: ~3335 "uses a complete standard-room countertop over an L-corner..." , ~3472 "audits every supported corner family...", "keeps the complete cardinal LSB36 top in the same shared 3D surface path" (~622+)
- crownStack.test.ts ~66 "does not add a second crown profile above ceiling-height pantries or refrigerator bridges"
Remaining: update tests, tsc, checkpoint, publish, verify on www.cabinetdealz.com with bundle filename, before/after screenshots.
