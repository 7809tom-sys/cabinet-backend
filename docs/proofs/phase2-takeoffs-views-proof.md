# Phase 2 proof — shared takeoffs and wall-run views

Validated locally on 2026-09-30 before checkpoint/publish.

## Rotated and depth-moved cabinet takeoff parity

The test applies the same catalog `W3030` and `B36` to a standard top wall and a Continuous Wall Builder wall. `syncWallRunOffsets` correctly clears seating metadata when a cabinet is turned off-axis or moved 1 inch away from the wall; `cabinetTakeoffWallId` associates it with its nearest physical run for material measurement without pretending it is still wall-seated.

| Scenario | Room | Production 3D crown takeoff | Crown width estimate | B36 toe kick | W3030 light rail |
|---|---:|---:|---:|---:|---:|
| Rotated W3030 90° + B36 45° | Standard | 70 in | 33 in | 36 in | 58 in |
| Rotated W3030 90° + B36 45° | Wall Builder | 70 in | 33 in | 36 in | 58 in |
| W3030 + B36 moved inward 1 in | Standard | 70 in | 33 in | 36 in | 58 in |
| W3030 + B36 moved inward 1 in | Wall Builder | 70 in | 33 in | 36 in | 58 in |

Additional regression: a `B36` seated on a 45° drawn wall counts **36 inches**, not a rotated plan bounding-box width.

The unchanged extended Phase 1 browser script was rerun against this local Phase 2 build: **0 mismatches** over B12, B36, W3030 drag, nudge, snap, rotate, depth-move, width-resize, palette-drop and legacy-load rows. The `rotate_90` records are off the prior wall's facing axis; the subsequent `rotate_180` faces away from it; and the 1-inch inward depth movement moves the base cabinet's back away from it. In those states `wallId`/`wallOffset` are intentionally `null` in the saved browser draft, not falsely retained as an installed wall seat. The takeoff association above still assigns their material widths to the nearest physical run in both rooms. A cabinet that is truly re-seated keeps a wall id and 1/8-inch offset.

## Elevation and 3D browser proof

| Check | Standard room | Wall Builder room |
|---|---|---|
| Elevation wall label | Back | Measured back run |
| Wall ceiling shown | 96 in | 108 in (drawn-wall height) |
| Continuous crown strip | 1 | 1 |
| Toe-kick strips | 3 | 3 |
| Light-rail strip | 1 | 1 |
| 3D canvas | 1 | 1 |
| Browser runtime errors | 0 | 0 |

The Wall Builder elevation screenshot shows its measured wall selector and 108-inch wall height; the standard-room screenshot remains at 96 inches. Both show the same cabinet offsets and trim paths. The Wall Builder 3D scene renders successfully.

**Photo Quality limit:** The 3D scene exposes the Photo Quality control on both room kinds, but the final image workflow requires an authenticated, saved design. This guest-only browser proof did not submit a render or generate a customer image; do not interpret the 3D canvas check as proof of a completed photo render.

## Automated validation

- Integrated focused suite: **548 tests passed**.
- Broader Phase 2 suite after adding all elevation tests: **571 passed**, one stale source-string test was updated to the existing shared `crownEligibleCabinets` helper.
- Full suite: 4,179 passed, 67 failed (65 failures already present at the prior baseline, plus two timeouts in untouched external AI consultant tests); no new client/geometry/view failures. Focused Phase 2 suites pass after a stale source-string assertion was updated.
- `pnpm run check`: passed.
- `pnpm run build`: passed.
- `git diff --check`: passed.

## Live verification (08:34 CDT, 2026-09-30)

Checkpoint `fe1e747e1` published as `index-875vHPhP.js` / `DesignTool-Ckrno2O7.js`; both are byte-identical to the local checkpoint build once hashed chunk imports are normalized. On www.cabinetdealz.com: standard elevation (Back, crown 1 / toe 3 / rail 1 strips), Wall Builder elevation (Measured back run, same strips), both 3D canvases with zero console errors; the unchanged extended parity script returned MISMATCHES 0 and LEGACY_MISMATCHES 0 (`phase2-live-extended-parity-output.md`, `phase2-live-browser-check.txt`).
