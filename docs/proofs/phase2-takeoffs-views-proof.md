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
| Wall ceiling shown | 96 in | ~~108 in~~ → 96 in after the height correction below (a drawn wall can never show taller than the room ceiling) |
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


## Height-rule correction (2026-09-30 08:49 brief)

Rule: the room has ONE ceiling (84–144 in, set only in Room size, never by the Wall Builder). Each drawn wall has its own height from a knee wall (34.5 in floor) up to the ceiling, never taller. Uppers and crown on a full-height wall use the ceiling; on a short wall the wall's own top is the limit.

Why "Measured back run 108 in" appeared: the earlier Phase 2 `wallCeiling()` read the drawn wall's saved `height` through `clampCeilingHeight` (84–144) and used it as the ceiling, so a 108 in wall saved in a 96 in room rendered and measured as 108 in — the wall height was being treated as the ceiling. That was the bug.

Fix (shared `client/src/lib/design.ts`, consumed by the 3D renderer, the elevation view and the wall-settings dialog): a new `wallTopLimit(room, wall)` = min(room ceiling, max(34.5, wall height rounded to 1/8)). `wallCeiling()`, `wallRunFrame`, `wallCabinetVerticalMoveLimit`, `ceilingFitViolations`, the 3D measured-wall plane height, the elevation ceiling line and the wall-height input (max = room ceiling) all use it. Nothing clamps a wall to 84 in any more; only the room ceiling keeps the 84–144 range. When a wall top is below the ceiling the elevation label reads `Wall top 42" (ceiling 96")` and the conflict banner names the half wall instead of the ceiling.

| Browser scenario (local build) | Wall saved | Room ceiling | Elevation label | Result |
|---|---:|---:|---|---|
| Standard room | — | 96 | Ceiling 96" | crown 1 / toe 3 / rail 1, 3D ok |
| Wall Builder, wall saved taller than ceiling | 108 | 96 | Ceiling 96" | capped at the ceiling, crown 1 / toe 3 / rail 1, 3D ok |
| Wall Builder half wall | 42 | 96 | Wall top 42" (ceiling 96") | W3030 hung at 54 in flagged CONFLICT ("stands above the top of its 3'6" half wall"), 3D wall plane 42 in |

Unit coverage: `oneEngineTakeoffParity.test.ts` (108 in a 96 room → 96; 108/108 equals the standard room; 42 in wall caps the upper, violation flagged, maxBottom 12), `ElevationView.customWall.test.tsx`, `InteractiveRoom3D.roomShape.test.ts` (wall-2 saved 108 renders 96). Screenshots: `docs/proofs/phase2-heights-*.png`.
