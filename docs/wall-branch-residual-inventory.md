# Residual standard-vs-Wall-Builder wall branches after Phase 1 (2026-09-29 23:40 CDT, HEAD 843e28b4)

Grep scope: `client/src/**/*.{ts,tsx}` excluding tests. Patterns: `isCustomRoomWall(`, `peninsulaRunById(`, `room.customWalls?.(length|some|find|filter|map)`, `room.vertices?.length`, `kind ===/!== "custom|cardinal|peninsula"`, and `wallId` truthiness/fallback checks. **184 raw hits**, classified below.

Legend for the "Class" column:

| Class | Meaning |
|---|---|
| **BRANCH** | Cabinet behaviour still differs by wall kind. Must be removed. |
| **KIND-RESOLVER** | Inside the shared run model itself (`wallRunFrame` etc.) or pure geometry lookup ("which segment is wall X?"). One engine still needs to know a wall's endpoints; this is not a behaviour fork. |
| **FALLBACK** | `wallId ?? cabinetWall(...)` / `spot.wallId ? {...}`. Legacy-record compatibility (cabinets saved before every wall carried a wallId). Behaviour is identical once the record has a wallId. Removable when a one-time migration back-fills wallId. |
| **UI-ONLY** | Labels, dropdowns, wall-settings dialog, drawn-wall SVG shell. No cabinet rule. |
| **PENINSULA** | Peninsula-run specific (a peninsula is a free-standing cabinet run, not a wall; it legitimately has its own rules such as two-sided seating). Not in scope of the standard-vs-Wall-Builder rule but listed for completeness. |

---

## A. Remaining BRANCH sites (behaviour differs by wall kind) — 17 sites

| # | File:line | What it does | Audit item | Phase |
|---|---|---|---|---|
| A1 | `design.ts:2610-2616` `cabinetCollisionDetail` | Same-run overlap check trusts `wallOffset` on drawn walls but re-validates it against `x/y` on cardinal walls (`cardinalRun` / `runOffsetIsCurrent`). Added in Phase 1 as a stale-offset guard. Should become: trust `seatedWallRunFrame` on every wall once every mutation path refreshes wallOffset (Phase 1 did that for move/nudge/drop/snap; remaining `x/y`-only mutators are width/depth resize and rotate). | **Not in audit** (new Phase 1 guard) | 2 |
| A2 | `design.ts:3585` `fitRefrigeratorEnclosurePlacements.alongStart` | `isCustomRoomWall ‖ peninsula ? wallOffset : wallRunOffset()` | 1.6 | 2 |
| A3 | `design.ts:3620` `fitRefrigeratorEnclosurePlacements.withinRoom` | Drawn walls return `true`; cardinal walls run a rectangle bounds check. | 1.6 | 2 |
| A4 | `design.ts:3922` `selectedLowerCabinetWallPlacement` | `measuredRun ? wallRunOffset : x/y` for upper-over-lower matching | 1.7 | 2 |
| A5 | `design.ts:4041` `matchingLowerCabinetWallPlacement` | Same as A4 | 1.7 | 2 |
| A6 | `design.ts:6857` `reconcileRefrigeratorAssemblies` | Member depth: `member.depth` on drawn walls, `placedFootprint().d/w` on cardinal | 1.8 | 2 |
| A7 | `design.ts:7430-7436` `freeSegmentsOnWall` | Drawn/peninsula: `{0, wallLength}`; cardinal: `cabinetWallRunSegment()` (which subtracts opening/door reservations differently) | 1.3 | 2 |
| A8 | `design.ts:7456-7462` `freeSegmentsOnWall` | 11" hold applied only when `customRoomWall` and the neighbour is a locked-45 wall | 1.15 | 4 |
| A9 | `design.ts:7500-7508` `freeSegmentsOnWall` | Corner-cabinet adjoining-leg reservation resolved only via `room.customWalls` shared vertex; cardinal uses a separate corner table | 1.3 | 2 |
| A10 | `design.ts:8859-8876` `seatedWallRunFrame` / `wallRunOffset` / `wallRunSpan` | Cardinal frames still re-derive offset/span from `x/y` + `rotatedSize` (`frame.kind !== "cardinal"` short-circuits). This is the last remnant of the "two coordinate systems" item. Depends on A1's mutators being closed. | 1.1 | 2 |
| A11 | `design.ts:9239-9240` `runSpan` (small-gap filler measurement) | Explicit run offsets only for drawn/peninsula; cardinal falls back to footprint | 1.1 (consumer) | 2 |
| A12 | `design.ts:11912-11918` `cabinetWallDragPreview` (`explicitWallRun`) | Still the 3D **drag-handle** preview (InteractiveRoom3D 9250, 9272) — separate from the D-pad path that Phase 1 unified. Required span uses catalog width on drawn walls, AABB on cardinal. | 1.9 | 2 (should be folded into `cabinetWallMovePreview`) |
| A13 | `design.ts:8652-8660` `autoSnapCabinetToNearbyWall` | Candidate segments come from `room.customWalls` if drawn, else the four `cabinetWallRunSegment`s. No longer called from DesignTool (Phase 1 replaced it) — **dead export**; delete. | 1.9 / 2.4 | 2 (delete) |
| A14 | `design.ts:8075-8111` `nextAvailableRoomCornerPlacement` | Drawn rooms: corner search walks `room.customWalls` shared vertices; rectangles: fixed four-corner table. Still called at DesignTool 4632, 7699 and PlanCanvas 963. | **Not in audit** (corner-cabinet auto-placement) | 2 |
| A15 | `design.ts:7890-7896` `alternateWallPlacementRecommendation` | Wall candidate list: `customWalls + peninsulaRuns` or the cardinal four. Should iterate `roomWallRunFrames(room)`. | **Not in audit** | 2 (trivial) |
| A16 | `rotatePlan.ts:71, 77, 104-108` | Rotate-plan keeps drawn wall ids, remaps cardinal ids via `CARDINAL_ROTATION`; wall ceilings not rotated for drawn rooms; cabinets re-owned via `closestWall` only in drawn rooms. | Audit §8 said "clean" — **that was wrong**; it has three kind checks. | 2 |
| A17 | `InteractiveRoom3D.tsx:5356-5357, 5450` | Facing rotation: cardinal frames go through `facingRotation`; drawn frames keep saved rotation. `onMeasuredCustomWall` gates the legacy re-seat. Phase 1 moved these onto the frame but the *decision* is still by `kind`. Fully removable once A10 lands (a cardinal frame's `facingRotation` equals the saved rotation for every seated cabinet). | 4.1 / 4.3 | 2 |

Already-audited items **not** in the grep because they are takeoff/view code that never mentions wall kind — they silently assume cardinal walls: 1.10 `miteredTrimInches`, 1.11 `toeKickLinearInches`, 1.12 light-rail, 1.13 wall-ceiling limits, 2.8 `buildPhotorealScene`, 5.1 ElevationView. Those are Phase 2.

---

## B. KIND-RESOLVER sites (inside the shared run model; not behaviour forks) — 28 sites

| File:line | Function | Note |
|---|---|---|
| `design.ts:1649` | `peninsulaRunById` | The lookup itself |
| `design.ts:5254, 5258` | `wallLength` | Length from vertices / peninsula / room.width|depth — the run model's length accessor |
| `design.ts:5545` | `cabinetWall` | Returns explicit `wallId` if it names a drawn wall or peninsula, else infers a cardinal side by geometry. Becomes a plain `wallId` read after the migration in §C. |
| `design.ts:7999` | `customWallTrueCornerPlacement` | Vertex lookup |
| `design.ts:8507, 8537` | `wallPlacementAt` | Seats on peninsula / drawn / cardinal geometry — this IS the shared seat function; both branches now emit `wallId`/`wallOffset` |
| `design.ts:8701, 8705-8706` | `isLockedAngledCustomWall`, `isCustomRoomWall` | Predicates (12 remaining callers, all listed in §A) |
| `design.ts:8769, 8775, 8798, 8830-8838` | `wallRunFrame`, `roomWallRunFrames`, `nearestWallRunAtPoint` | The Phase 1 run model; kind is a field, cardinal outside-run distance = ∞ so a rectangle's four walls behave like a closed polygon |
| `design.ts:8900` | `continuousWallApplianceSnapInfo` | Feedback badge data for drawn-wall appliance snap (UI feedback, not placement) |
| `design.ts:8934-8953, 8970-8984, 9011` | `restoredDrawnWallCornerPlacement`, `containCabinetOnDrawnWalls`, `clampCabinetToRoom` | Room containment: polygon containment vs rectangle clamp. Same rule ("stay inside the drawn walls"), two geometries. Phase 1 made `clampCabinetToRoom` the single entry point. |
| `design.ts:10887-11058` | `customWallJoinTurnsFortyFive`, `measuredWallCountertopMiterSurfaces`, `measuredWallSurfaceWithMiterPoint`, `miteredMeasuredWallCountertopSurfaces` | Countertop miter at drawn-wall joins (item 1.14 — Phase 2/5 scope, D-class in audit) |
| `design.ts:11217-11232` | `countertopSurfaces` | Tags a surface with `customWallId` for the 3D renderer (1.14) |
| `design.ts:2849-2954` | `customWallCornerReservationCollision`, `hasSeatedCustomWallCornerPair`, `isMiteredWallFillerJoinPeer` | Corner/miter collision exceptions that need the two walls' shared vertex. Rectangle corners are fixed; polygon corners need lookup. (Partially 1.15 / 7.x.) |
| `design.ts:3389` | `appendCollisionFreePlacements` | `wallRunFrame(...)` truthiness — already unified |
| `design.ts:6314, 6327` | `snapWallCabinetToOwningWall` | Only re-seats depth on cardinal frames; drawn walls are seated by `wallPlacementAt`. Behaviour is the same (flush to wall); could be simplified with A10. |
| `design.ts:7782-7834` | `cabinetWallMovePreview` | The Phase 1 engine; `keepRotation` preserves an existing same-axis rotation on cardinal frames only (legacy 180/270 records) |
| `design.ts:2826, 3046, 3098, 7633, 8180, 10768` | peninsula start-offset / corner / L-support helpers | PENINSULA class |
| `angledWallFiller.ts:124, 133, 161, 173` | wall/peninsula segment lookup for the angled filler | Geometry lookup (7.x constants are the Phase 4 item) |
| `smallGapFiller.ts:153` | peninsula lookup | PENINSULA |
| `designTool3DWorkspace.ts:13` | `hasCustomWallPath` | Decides whether the "Edit wall" polygon editor can open — UI |

---

## C. FALLBACK sites (`wallId ?? cabinetWall()` / `spot.wallId ? {...}`) — 22 sites

`DesignTool.tsx` 2024, 3804, 4801, 5550, 5625, 5913, 6364, 6514, 8052, 8438, 8460, 15619, 15625; `design.ts` 1819, 3614, 4003, 7791, 8229, 8284, 8318, 11512; `angledWallFiller.ts` 301, 507; `rangeCompanion.ts` 203; `PlanCanvas.tsx` 44, 1005.

These are all "use the saved wallId if present, otherwise infer the side geometrically". Since Phase 1 every new/moved cabinet carries `wallId`, so the else-branch only fires for **pre-Phase-1 saved designs**. Recommended: a one-time normaliser in the draft/restore chain (`normalizePlacedCabinets`) that back-fills `wallId`/`wallOffset` for cardinal cabinets, after which these become plain reads. Not a behaviour fork.

---

## D. UI-ONLY sites — 24 sites

`DesignTool.tsx` 602 (`isPolygonRoom`), 1060-1061, 1171-1172, 1202-1489 (wall-settings dialog draft `kind`), 5219, 7927-7928 (toast wall label), 8442, 8464, 9200 (labels only — the Snap-to-wall logic under 9200 is unified), 10216-10217, 10853, 11075, 12423-12427, 13887-14091 (wall dropdowns/dialog); `PlanCanvas.tsx` 100, 686, 694, 1391, 2178 (drawn-wall SVG shell, opening placement on drawn walls, snap badge label), 2207 (peninsula badge); `InteractiveRoom3D.tsx` 2854 (drawn-wall mesh list — item 4.5, Phase 2).

---

## E. PENINSULA-only sites — 9 sites

`DesignTool.tsx` 1235, 1347, 1363, 1419, 1459, 4022, 4630, 5043/5052 (skip generic seam snap on peninsula because the peninsula has its own two-sided seam rule), 5203, 5848, 5954, 7659; `design.ts` 1762, 1865, 2826, 3046, 3098, 7633, 8180, 8681, 10768. Peninsulas are cabinet runs, not walls; out of scope for the standard-vs-Wall-Builder rule.

---

## Summary

| Class | Count | Action |
|---|---|---|
| BRANCH (A) | 17 | Remove in Phases 2 and 4; 4 of them (A1, A14, A15, A16) were **not** in the original audit and are added here |
| KIND-RESOLVER (B) | 28 | Keep — this is the one run model knowing its geometry |
| FALLBACK (C) | 22 | Collapse after a one-time wallId back-fill migration |
| UI-ONLY (D) | 24 | Keep |
| PENINSULA (E) | ~20 | Out of scope |

Audit corrections: §8 listed `rotatePlan.ts` as clean — it has three wall-kind checks (A16). `cabinetCollisionDetail`'s cardinal guard (A1) is new Phase 1 debt and is the blocker for finishing 1.1 (A10).

## Status after Phase 1 finish-up (2026-09-30 01:56)
A1–A17 collapsed onto the shared wall-run frame (see todo-alvsvcze.md entry). Remaining `customWalls`/`vertices` references in design.ts are polygon-geometry helpers (wall length/angle from vertices, 45° join detection, drawn-room shell containment) and legacy back-fill for records saved without run metadata — they compute the run frame, they do not decide behavior by wall kind. Remaining UI references (DesignTool wall settings drawer, PlanCanvas wall labels/openings on drawn walls) are display/labels, not cabinet rules. Phase 2 items (takeoffs/views, rotatedSize) are unchanged and next.
