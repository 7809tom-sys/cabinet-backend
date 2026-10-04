# Free-standing 45° run — make the normal Designer match the Continuous Wall Builder (2026-10-03)

User request (verbatim intent): "Continuous Wall Builder handles the 45° angled section perfectly. Do not change it. Copy its angled-corner
and countertop code into the 3D Designer. One continuous countertop across the whole run incl. the angled cabinet, no seams/steps. Remove the floating
countertop piece at the end (countertop only where there's a cabinet under it). Angled cabinet flush against both neighbours. Tops/fronts line up.
Prove live on www.cabinetdealz.com with side-by-side screenshots of the same layout in both tools." User doesn't know which tool built the angled section;
"just make the Designer match the Continuous Wall Builder".

Screenshots: /home/ubuntu/upload/Screenshot2026-10-03195430.png (Designer: 3 bases + angled base, separate tops, floating slab at end, gap at the angled cabinet)
             /home/ubuntu/upload/Screenshot2026-10-03195721.png (Wall Builder: 45° mitered seamless run — the reference)

## Code facts (verified)
- design.ts `countertopSurfaces()` @~11874: for a base w/o customWall/peninsula it falls to the "standard" branch, uses `cabinetWall()` (nearest wall when no wallId)
  and `wallPlacementAt()` → slab snapped onto the WALL. That's the floating slab for free-standing cabinets.
- Measured (custom) wall branch: per-cabinet slab centred on the cabinet's run span & rotation (`rotation: spot.rotation`), then
  `measuredWallCountertopMiterSurfaces()` @~11352 adds the 45° miter and `measuredWallSurfaceWithMiterPoint()` @~11418 cuts neighbour slabs to a shared miter
  point. That is the "Continuous Wall Builder" countertop logic (reuse the helpers, do not modify).
- `countertopSurfaceFromWorldPolygon(world, runId?)` @~11130 builds a CountertopSurface (AABB + local polygon) from world points. Reuse for a free-standing run outline.
- `countertopSurfacePlanPolygon(surface)` gives world polygon (rotation about AABB centre).
- 3D: `addThreeDStandardCountertops()` renders surfaces via `threeDPeninsulaCountertopGeometry` (extruded polygon). I added `threeDStandardCountertopSurfaces()`
  + `countertopSurfaceCoversCabinet()` (checkpoint df4fba7d) so uncovered shared slabs are skipped and uncovered cabinets keep their own box top.
- Cabinet placement convention: p.x/p.y = top-left of the rotated AABB (`rotatedSize` → 33.94 for a 24x24 at 45°); rotation 0 = faces +y (front toward bottom/south),
  90 = faces... (wallPlacementAt right → rotation 90, left → 90). In 3D, `existingCabinetTransform` centres at AABB centre; `threeDRoomFacingRotation` for explicit
  45/135/225/315 returns `threeDPlanRotation(savedRotation)` (plan rotation negated for three.js).
- `threeDLegacyWallAnchor`: base within 18" of its facing wall gets snapped in 3D; otherwise free.
- Toe kick: `threeDContinuousToeKickSegments` now skips run-less cabinets not against the wall (my change, checkpoint df4fba7d).
- `isAgainstWall` tolerance 2". `isOnIsland` @4423. `snapPosition` @2460 only snaps AABBs axis-aligned (no 45° neighbour magnet exists for free cabinets).
- PlanCanvas countertop layer @~1882 renders `countertopSurfaces()` rects/polygons with rotation → whatever I emit shows in Floor Plan too.

## Plan
1. In design.ts `countertopSurfaces()`: before the standard-wall branch, detect FREE-STANDING bases (no wallId, not against any wall within 2", not island,
   not peninsula) and group them into chains by edge adjacency (touching along the front-tangent axis, within 1.5"). For each chain emit ONE polygon slab:
   union of per-cabinet slabs (cabinet rect + 1.5" front overhang along its facing normal), joined at 45° turns with the same miter geometry as the
   wall builder (shared miter point = intersection of the two front edges; wall-side = intersection of the two back edges). Mark `freestandingRunId`.
2. Snap: angled cabinet flush to neighbours — add a helper `snapFortyFiveNeighbour` used in DesignTool drop/drag when rotation is ±45 and a neighbour's
   end is within SNAP_THRESHOLD: place the rotated box so its back corner touches the neighbour's back corner and fronts meet (mitered, no gap).
3. Proof: build same layout in Designer (free drop) and Wall Builder on live, side-by-side screenshots → notes/live-proof/.
Render scripts: /tmp/render_free.py (+ /tmp/inject_free.js draft; copy to client/public/__qa_inject.js for dev, delete after).

## Outcome (checkpoint 4bf1a758)

- New module `client/src/lib/freestandingRun.ts`: `isFreestandingBase`, `freestandingChains` (touching open-room bases → ordered chain), `freestandingChainOutline` (back polyline + front polyline, neighbouring edges extended to their intersection = Continuous Wall Builder miter), `freestandingCountertopSurfaces` (one polygon `CountertopSurface` per chain, `freestandingMemberUids` set), `snapFreestandingFortyFive` (corner-to-corner flush seat; only seats whose true bodies don't overlap).
- `countertopSurfaces` skips free-standing bases in the wall branch and appends chain slabs; `CountertopSurface.freestandingMemberUids` added.
- Collision: `usesFreestandingFortyFiveBodyCheck` + exported `cabinetPlanBodiesIntersect` waive false AABB overlap in both `hasCollision` and the room-aware detail, so the flush 45° seat survives drop and the reload sweep (`removeOverlappingPlacements`).
- DesignTool free-floating drag branch tries the 45° flush seat before the rectangular `snapPosition`.
- Tests: `client/src/lib/freestandingRun.test.ts` (3), `FreestandingCountertop.test.ts` updated. Full suite: no new failures vs baseline (design.consult / tawk are network tests).
- Proof renders (dev): /tmp/ff_top2_crop.png, /tmp/ff_side2_crop.png — one slab, true miter at the turn, no wall slabs.

## 2026-10-03 20:55 — Hard-stop request: one shared code path

User: don't patch the Designer's own corner code, don't write new code; find the Wall Builder's angled-corner functions and make the Designer call them. Pass criteria on live: one continuous top across the 45° turn, no unsupported top, angled cabinet flush to both neighbours, side-by-side U-shape screenshots from www.cabinetdealz.com.

### Continuous Wall Builder code map (verified by reading)
| Step | File | Function |
|---|---|---|
| UI | client/src/components/design/WallBuilder.tsx | `WallBuilder` (segments + turn choice), `onApply(WallBuilderRoomGeometry)` |
| Walls → room model | client/src/lib/polygonRoom.ts | `wallBuilderRoomGeometry(segments)` → `vertices`, `customWalls` (diagonal walls get `lockedAngle: ±45`), `openWallPath` |
| Apply to design | client/src/pages/DesignTool.tsx | `applyContinuousWallRoom(outline)` sets `room.vertices/customWalls/openWallPath` |
| Run frame | client/src/lib/design.ts | `wallRunFrame(side, room)` (kind "custom") via `frameFromSegment`; cabinet side from `customWallCabinetSide(room)` |
| Cabinet seat | client/src/lib/design.ts | `wallPlacementAt(along, w, d, wallId, room)` custom-wall branch → `{x,y,rotation,wallId,wallOffset}`; 45° inside-corner hold `insideCornerHoldIn(turnDeg, depth)` |
| Countertop per wall | client/src/lib/design.ts | `countertopSurfaces()` custom-wall branch (slab along the run, `rotation: spot.rotation`, `customWallId`, `customWallRunStartIn`) |
| Merge along a wall | client/src/lib/design.ts | `mergeContiguousBaseCountertopRuns(out, room)` |
| 45° miter | client/src/lib/design.ts | `measuredWallCountertopMiterSurfaces(placed, room)` (verifies both end cabinets, builds the vertex triangle) → `miteredMeasuredWallCountertopSurfaces(surfaces, placed, room)` (cuts both slabs to the shared miter point via `countertopOffsetEdgeMiterPoint`, `countertopRunFaceNormal`, `customWallJoinTurnsFortyFive`, `sharedCustomWallVertex`) |

### Reroute plan (no change to Wall Builder behaviour)
`freestandingRun.ts` keeps only chain detection; the chain's back line becomes a synthetic open wall path (`vertices` + `customWalls` with `lockedAngle` on diagonals, `openWallPath: true`), the chain cabinets are seated on it with `wallPlacementAt` (`wallId`/`wallOffset` from `wallRunAlongAtPoint`), and `countertopSurfaces` is called on that synthetic room so the EXACT custom-wall branch + merge + miter code builds the slab. My own `freestandingChainOutline` miter math is removed. The 45° drop seat uses `wallPlacementAt` on the synthetic wall too.

### Progress 21:12 (uncheckpointed, typecheck clean)
- `freestandingRun.ts` rewritten: chain detection only; `freestandingJoin` uses Wall Builder rule (straight ends touch; 45° legs hold `insideCornerHoldIn(45,depth)` = 11" from shared vertex, +≤3" filler); `freestandingChainWallModel` → synthetic `vertices/customWalls(lockedAngle)/openWallPath`, `orientWallPathToFacing` flips the path when `customWallCabinetSide` disagrees with the bodies' facing; cabinets seated via `wallPlacementAt`; `freestandingCountertopSurfaces` = `countertopSurfaces(seated, syntheticRoom)` re-expressed as world polygons tagged `freestandingMemberUids` + `cabinetRunId: freestanding:<uids>`. `snapFreestandingFortyFive` seats via two-wall synthetic path + `wallPlacementAt(hold)`.
- InteractiveRoom3D `threeDStandardCountertopSurfaces`: keep every slab of a chain when any member is covered (so the 45° corner infill triangle renders).
- Test `freestandingRun.test.ts` is now a PARITY test: same run built with `appendWallBuilderSegment([],83,"start")+(35,"right45")` → `wallBuilderRoomGeometry` → `wallPlacementAt` gives polygon-identical countertops (3 surfaces: leg, leg, corner infill). Passing.
- Dev render /tmp/wb_designer_crop.png: continuous top across the 45° turn, no floating piece. Render script /tmp/render_free.py reads client/public/__qa_inject.js (delete before checkpoint). Seat for d: x=113.8076, y=77.7782 (rotation 45) next to c at (88,70).
- TODO: full suite vs /tmp/fail_after5.txt, checkpoint, wait for deploy (InteractiveRoom3D chunk marker `freestandingMemberUids`), then live U-shape side-by-side: Wall Builder room via injected draft with customWalls vs Designer standard room with free-standing cabinets; save to notes/live-proof/.
