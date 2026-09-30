# Step 6 Audit — Where the Continuous Wall Builder keeps its own copy of cabinet rules

Date: 2026-09-29 · HEAD `409dadec` · No code changed for this audit.

## How the two tools are wired today (the honest picture)

- `WallBuilder.tsx`, `PolygonRoomEditor.tsx`, `RoomLayoutStarter.tsx`, `wallBuilderExport.ts` only **draw the room outline** (wall lengths, turns, heights). They contain **no cabinet codes, sizes, prices, or placement rules**. Once "Apply" is pressed, `DesignTool.applyContinuousWallRoom` (DesignTool.tsx:7580) writes `room.vertices` + `room.customWalls` and the **same Designer page** places cabinets.
- So the drift is **not** a second Wall Builder codebase. The drift is inside the shared engine itself: `design.ts`, `DesignTool.tsx`, `PlanCanvas.tsx`, `InteractiveRoom3D.tsx` all contain `if (isCustomRoomWall(...)) { …measured-wall rule… } else { …rectangular-room rule… }` forks. Every one of those forks is a place where a normal cabinet can behave differently on a Wall Builder wall than on a standard wall. That list is below.

Legend: **A** = separate placement/snap/collision path · **B** = hard-coded size/limit · **C** = takeoff/invoice/materials path that mis-measures or breaks on measured walls · **D** = render/rotation fork.

## 1. `client/src/lib/design.ts` (shared engine — the forks live here)

| # | Line(s) | Type | What is duplicated / forked | Should become |
|---|---|---|---|---|
| 1.1 | 8549 `isCustomRoomWall`, 8555 `wallRunOffset`, 8561 `wallRunSpan` | A | Two coordinate systems: cardinal walls measure position with `x/y` + `rotatedSize()` (screen box); measured walls use `wallOffset` + catalog `width`. Every caller must remember to branch. | One run-axis accessor used by both (`wallRunOffset/wallRunSpan` for **all** walls), so no caller branches. |
| 1.2 | 3383 `resolveCollisions` | A | Cardinal candidates go through `snapCabinetSeamOverlap`; measured-wall candidates skip it (`preserveMeasuredWallGeometry`). | Seam snap must be run-axis aware and used on both. |
| 1.3 | 7406-7446 `freeSegmentsOnWall` | A/B | Measured walls use `{0, wallLength}`; cardinal walls use `cabinetWallRunSegment`. 11" hold (`PENINSULA_INSIDE_CORNER_CLEARANCE_IN`) applied by wall-type branch. | One free-segment builder; 45° hold decided by join angle only, independent of wall type. |
| 1.4 | 7620-7665 `firstCollisionFreeCustomWallPlacement` | A | A second 1/8" placement search that exists **only** for measured walls; cardinal walls use `wallPlacementAt` directly. First line even says `if (!isCustomRoomWall) return wallPlacementAt(...)`. | Fold the 1/8" collision-free search into `wallPlacementAt`-level placement for every wall. |
| 1.5 | 6304 `snapWallCabinetToOwningWall` | A | Returns early for measured walls (no depth re-seat); cardinal walls are re-seated with `snapToWall`. | One depth re-seat using the wall's inward normal (`wallPlacementAt` already knows it). |
| 1.6 | 3572-3620 refrigerator enclosure fitter | A | `alongStart`, `withinRoom` branch by wall type; measured walls skip the room-bounds check. | Single inside-the-walls test (polygon containment) for all walls. |
| 1.7 | 3916-3930, 4035-4050 upper-over-lower matching | A | `measuredRun ? wallRunOffset : x/y` branches. | Falls out of 1.1. |
| 1.8 | 6833 refrigerator member depth | A | Measured walls read `member.depth`; cardinal read `placedFootprint().d/w`. | Falls out of 1.1. |
| 1.9 | 11588-11782 `cabinetWallDragPreview` / `cabinetWallDragPreviewAtPoint` (`explicitWallRun` branches ×6: 11599, 11604, 11665, 11688, 11714, 11725, 11769) | A | Drag snap uses catalog width + wall length on measured walls but screen AABB + `room.width/depth` on cardinal walls; physical-edge candidates and seam snap are disabled for measured walls. | One drag engine on run-axis coordinates for all walls. |
| 1.10 | 5623 `miteredTrimInches` (crown estimate) | C | `perWall: Record<WallSide>` keyed by `cabinetWall()`. On a measured wall `cabinetWall()` returns the custom wall id, so `perWall[id]` is `undefined` → **NaN** crown inches. Also sums `rotatedSize(p).w`, which is inflated for 45° cabinets. | Group by any wall id; sum catalog `width` via `wallRunSpan`. |
| 1.11 | 5702 `toeKickLinearInches` | C | Sums `rotatedSize(p).w`: a 36×24 base at 45° counts **42.4"** of toe kick instead of 36". Feeds DesignTool.tsx:3437 toe-kick piece count. | Sum catalog `width`. |
| 1.12 | 5720-5790 light-rail takeoff (`lightRailExposedEdgeInches`, `backEdge: Record<WallSide>`) | C | Axis-aligned x/y/width/depth footprints and a four-side `backEdge` map — wrong on any rotated (45°) run, undefined for custom wall ids. | Run-axis footprints; back edge from the owning wall's normal. |
| 1.13 | 1945-1990 `wallCeiling*`, 5750ff `wallCabinetVerticalMoveLimit` | B/C | Ceiling limits use `wallCeilings: Record<WallSide>` and `room.width/depth` + `cabinet.x/y`. A Wall Builder wall's own `customWall.height` (3D draws it) is **never** used for cabinet ceiling limits/crown eligibility; they fall back to `room.ceilingHeight`. | Ceiling lookup by wall id, including `customWall.height`. |
| 1.14 | 10728 `miteredMeasuredWallCountertopSurfaces` vs 10890 `countertopSurfaces` | D | Two countertop builders: measured-wall surfaces are built, then post-processed into miters (11005). Cardinal walls use a different merge. (Same 1.5" overhang constant, but two code paths.) | One run-based countertop builder that takes wall angle from the wall record. |
| 1.15 | 2593 `PENINSULA_INSIDE_CORNER_CLEARANCE_IN = 11` used at 3097, 3107, 7423-7446, 8081-8092, 10603, 10758 | B | The 11" rule is applied in six separate places by wall-type/peninsula branch rather than one "join angle = 45° → hold 11", 90° → flush" function. | One `insideCornerHoldIn(joinAngle)` used everywhere. |
| 1.16 | 19 inline `Math.round(v * 8) / 8` | B | 1/8" rounding re-typed inline (31× in DesignTool.tsx, 14× polygonRoom.ts, 7× InteractiveRoom3D.tsx, 6× PolygonRoomEditor.tsx, 2× PlanCanvas.tsx). No shared `roundToEighth()`. | One exported helper. |

## 2. `client/src/pages/DesignTool.tsx` (commit paths)

| # | Line(s) | Type | Fork | Should become |
|---|---|---|---|---|
| 2.1 | 5731-5745 `addCabinet` catalog drop | A | `isCustomRoomWall ? firstCollisionFreeCustomWallPlacement : wallPlacementAt`. | Single call (after 1.4). |
| 2.2 | 7765-7768 3D drop along-position | A | `positionAlongWall` for measured, `center.x/y` for cardinal. | Single run-axis projection. |
| 2.3 | 7832-7850 3D catalog drop | A | Same fork as 2.1. | Same. |
| 2.4 | 7899-8000 `moveCabinet` | A | ~100-line measured-wall branch (`closestWall` re-owning, `positionAlongWall`, `magneticAvailableWallStart`, `firstCollisionFreeCustomWallPlacement`), then cardinal walls take `snapPosition` + `snapCabinetSeamOverlap` (7988-7996) which are **skipped** for measured walls. Two snapping behaviors. | One move path. |
| 2.5 | 8267-8280 keyboard nudge | A | Measured walls re-route to `moveCabinet(exactWallDrag=true)`; cardinal walls use a separate `setPlaced` clamp. | One nudge path. |
| 2.6 | 9335-9360 "Snap to wall" button | A | Custom-wall branch again calls `firstCollisionFreeCustomWallPlacement`. | Same. |
| 2.7 | 6641 refrigerator depth | A | `isCustomRoomWall ? configuredFridge.depth : fp.d`. | Falls out of 1.1. |
| 2.8 | 7153-7160 `buildPhotorealScene` | C | `wallCabs: Record<WallSide>`; `wallCabs[customWallId].push` is a TypeError on measured walls (photoreal scene cannot be built from a Wall Builder room). | Group by wall id. |
| 2.9 | 3437 toe-kick pieces | C | Consumes 1.11. | — |

## 3. `client/src/components/design/PlanCanvas.tsx`

| # | Line(s) | Type | Fork |
|---|---|---|---|
| 3.1 | 985-1000 cabinet drag | A | Measured walls → `cabinetWallDragPreviewAtPoint`; cardinal walls → the older pointer/`onMove` path. (This is the uncommitted follow-up; Floor Plan drag still lands 0.55" short of the seam.) |
| 3.2 | 1128-1160 drop-target wall resolution | A | `closestWall(...)` for polygon rooms vs `nearestRectRoomWallAtPoint` for rectangles. |
| 3.3 | 1310-1330, 687-700 | D | Separate SVG layer draws measured walls/openings; rectangular rooms use the div border. |

## 4. `client/src/components/design/InteractiveRoom3D.tsx`

| # | Line(s) | Type | Fork |
|---|---|---|---|
| 4.1 | 5352, 5446 rotation | D | Measured-wall cabinets keep saved rotation; cardinal cabinets go through `cornerRotationForPlaced` / `threeDRoomFacingRotation`. |
| 4.2 | 5470-5480 body origin | D | `lockedAngledCorner` recovers a rotated-envelope center only for wallId+wallOffset corner cabinets. |
| 4.3 | 5503-5520 legacy wall re-seat | D | `isMeasuredWallCabinet` skips `threeDLegacyWallAnchor`; cardinal bases get re-seated to room edges. |
| 4.4 | 5644-5690 countertop extrusion | D | Separate loop for `surface.customWallId` surfaces (`measuredWallContinuousCountertop`, `miterAngleDegrees: 45` hard-coded) vs the standard slab loop. |
| 4.5 | 8493-8530 wall meshes | D | Measured walls use `customWall.height`; cardinal walls use `wallHeights[side]` (see 1.13 — cabinets don't see `customWall.height`). |
| 4.6 | 7405-7421 openings | D | Custom-wall openings positioned via `customWallCabinetSide` + `polygonWallAngle`; cardinal openings via side math. |

## 5. `client/src/components/design/ElevationView.tsx`

| # | Line(s) | Type | Fork |
|---|---|---|---|
| 5.1 | 285-319, 801, 902, 1932 | C/D | Elevation is hard-wired to `top/left/bottom/right` (`planSpan = room.width/depth`, wall chips are the four cardinal sides). Cabinets on a Wall Builder wall (`cabinetWall()` returns a custom id) never match `=== side`, so the **elevation view cannot show a measured wall at all**. |

## 6. `client/src/lib/polygonRoom.ts` (Wall Builder geometry) — hard-coded limits that differ from the Designer's

| # | Line(s) | Type | Duplicate | Designer's constant |
|---|---|---|---|---|
| 6.1 | 257, 310, 559 | B | Wall height clamp `34.5 … 144`, default `96`, inline 1/8" rounding. | `design.ts:1925` `MIN_CEILING_HEIGHT = 84`, `MAX_CEILING_HEIGHT = 144`, `clampCeilingHeight()`. Wall Builder accepts 34.5"–83" heights the Designer would reject. |
| 6.2 | 580-581, 607-608 | B | Room bounds floor `Math.max(36, …)`. | `design.ts:6312` `ROOM_MIN_IN = 36` / `clampRoomInches()` (same value, separate copy). |
| 6.3 | 62 `WALL_BUILDER_MIN_WALL_IN = 6` | B | Minimum wall length lives only here (PolygonRoomEditor.tsx:625 re-types `min="6"`). | Should be one exported constant used by both editors. |
| 6.4 | 209-211 PolygonRoomEditor.tsx | B | Vertex drag snaps to a **6" grid**; Designer placement is 1/8". | Shared `roundToEighth`. |
| 6.5 | 380 `Math.round(headingDeg / 45) * 45` | B | 45° heading snap re-implemented; `design.ts` has its own 45/135/225/315 checks (rotatedSize, InteractiveRoom3D 5352). | One angle-normalizer. |

## 7. `client/src/lib/angledWallFiller.ts`

| # | Line(s) | Type | Duplicate |
|---|---|---|---|
| 7.1 | 19-30 | B | `FRONT_FILLER_DEPTH_IN = 0.75`, `JOIN_EPSILON_IN = 0.25`, and its own `transitionFrontDatumDepth()` (24"/12") — the datum already exists as `STD.BASE_DEPTH/WALL_DEPTH` but the front-filler depth and epsilon are local constants not shared with the standard filler path (`catalogFiller.ts`, `smallGapFiller.ts`). |
| 7.2 | 338 | B | `< 0.125` gap threshold inline. |
| 7.3 | 445-457 | A | Its own height/placement compatibility filter on filler stock (regex on source text) before `catalogFillerForGap`; the straight-run filler suggestion uses a different filter. |

## 8. Files with **no** duplicated cabinet rules (checked, clean)

`WallBuilder.tsx` (draw UI only; imports `parseLengthToInches`/`formatEighthInches` from design.ts), `wallBuilderExport.ts` (PNG/PDF of the outline only), `RoomLayoutStarter.tsx` (shape presets; no cabinet data), `physicalRoomMeasurement.ts` (uses shared `clampRoomInches`), `rotatePlan.ts` (uses shared `wallPlacementAt`/`placedFootprint`), `designTool3DMovement.ts` (uses shared `wallPlacementAt*`; one `MAX_CABINET_PLAN_MOVE_IN = 120` UI limit), `designTool3DWorkspace.ts`. Pricing files (`designMaterialsList.ts`, `orderLinePricing.ts`, `checkoutPriceLock.ts`, `designPricingIdentity.ts`) key off catalog rows and are wall-agnostic — **a cabinet's unit price and invoice line are already identical in both tools**. The differences are in the geometry-derived takeoffs (crown, toe kick, light rail) and in the elevation/photoreal views.

## What "one engine" work this implies (not started)

1. Make every wall (cardinal or measured) a run with `{id, start, end, angle, height}`; give cardinal walls the same `wallId/wallOffset` the Wall Builder walls already have. That single change removes forks 1.1–1.9, 2.1–2.7, 3.1–3.2, 4.1–4.3.
2. Rewrite the takeoffs (1.10–1.13, 2.8) to group by wall id and measure by catalog width, and make ElevationView (5.1) render any wall id.
3. Replace polygonRoom's hard-coded 34.5/144/96/36/6"/6-grid (6.1–6.5) with the design.ts constants and a shared `roundToEighth`.
4. Consolidate the 11" hold (1.15) and the angled-filler constants (7.x) into single shared functions.
5. Then the Step 5 parity proof (B12, B36, W3030 in a standard room and a Wall Builder room: size, offset from wall start, price, invoice line, materials rows incl. crown/toe kick/light rail) in tests + live browser.

## Uncommitted work sitting in the tree (not checkpointed, not published)

`PlanCanvas.tsx`, `design.ts`, `design.test.ts` — the Floor Plan W3042→WDC2442 drag follow-up stopped on your "stop". Tests pass; the browser proof still lands 0.55" short. Awaiting your decision to finish or revert.
