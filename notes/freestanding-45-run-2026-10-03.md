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
