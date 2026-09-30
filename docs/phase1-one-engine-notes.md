# Phase 1 working notes (one-engine wall run model) — 2026-09-29

Baseline at HEAD 409dadec: full vitest = 39 failed files / 66 failed tests / 4152 passed (pre-existing; list in /tmp/baseline-vitest.json). Notable pre-existing failures relevant to our files: angledWallPlacement.test.ts (4), PolygonRoomEditorCompass.test.ts (3), DesignTool.requiredBlindCornerFiller.test.ts (2), several string-contains source tests for DesignTool/InteractiveRoom3D. CabinetAttributesDialog.mounting.test.tsx fails on matchMedia. These must not be counted as regressions.

## Key facts (design.ts at HEAD line numbers)
- WallSide type 5200 = "top"|"bottom"|"left"|"right"; custom wall ids and peninsula ids are cast to WallSide everywhere.
- wallLength(side, room) 5247 handles peninsula, custom, cardinal.
- cabinetWallRunSegment(side, room) 5277: cardinal wall usable run {start,length} (peninsula splits).
- wallPlacementAt(along,width,depth,side,room,peninsulaSide?,clampToRun=true) 8344: peninsula → {x,y,rotation,wallId,wallOffset,peninsulaSide}; custom → {x,y,rotation,wallId,wallOffset}; cardinal → {x,y,rotation} ONLY (no wallId/wallOffset). x/y is AABB origin (rotated envelope), rotation 0 horiz / 90 vert.
- cabinetWall(p, room) → p.wallId if custom/peninsula, else infer from x/y via isAgainstWall (2" tol) / nearest half.
- isCustomRoomWall 8549; wallRunOffset 8555 / wallRunSpan 8561 (custom/peninsula: wallOffset & width; cardinal: x/y & rotatedSize).
- firstCollisionFreeCustomWallPlacement 7643 (1/8" search on custom wall only; returns wallPlacementAt for cardinal).
- resolveCollisions/appendCollisionFreePlacements ~3375: preserveMeasuredWallGeometry skips snapCabinetSeamOverlap for custom.
- snapWallCabinetToOwningWall 6301: early return for custom/peninsula; cardinal uses snapToWall.
- snapPosition 2385 (AABB, room.width/depth edges + cabinet edges, T=STD.SNAP_THRESHOLD=6). snapCabinetSeamOverlap 3175 (AABB seam, tolerance CABINET_SEAM_SNAP_IN). autoSnapCabinetToNearbyWall 8460 (already wall-generic: segments for custom or cardinal+peninsula; uses wallPlacementAt + freeSegmentsOnWall + cabinetPlacementCollisionDetail).
- freeSegmentsOnWall 7395: explicitRun uses {0,wallLength} else cabinetWallRunSegment; 11" hold blocks for custom 45° joins (customWallJoinTurnsFortyFive) and peninsula; per-item start/span via wallRunOffset/wallRunSpan when explicitRun else x/y + rotatedSize.
- magneticAvailableWallStart 7367 / nearestAvailableWallStart 7340 (segment based, wall generic).
- cabinetWallDragPreview 11588: explicitWallRun forks (requiredSpan, wallSpan, physicalEdgeCandidates=[] for explicit, collidesOnThisRun uses cabinetPlacementCollisionDetail(room) for explicit vs hasCollision, edge candidates skip seam snap? no—HEAD applies snapCabinetSeamOverlap to edge candidates for both; final candidate seam-snapped unless disableSnapping).
- containCabinetOnDrawnWalls 8656 (custom rooms only) used by clampCabinetToRoom; cardinal clamp is AABB.
- placedFootprint (AABB incl. corner squares), rotatedSize (45° → inflated envelope).
- PENINSULA_INSIDE_CORNER_CLEARANCE_IN = 11 at 2593.
- polygonRoom.ts: wallAngle(wall, vertices) 134, closestWall 788, positionAlongWall 837, pointInPolygon 700.

## DesignTool.tsx (HEAD lines)
- moveCabinet 7899-8061: custom-wall branch 7934-7987 (closestWall re-own, positionAlongWall, freeSegmentsOnWall(…,0.5,…), magneticAvailableWallStart, firstCollisionFreeCustomWallPlacement); cardinal path 7988-7996 snapPosition + snapCabinetSeamOverlap(…, automaticSnapping ? CABINET_CONFLICT_LOCK_IN : undefined). Then shouldBlockPlacementCollision, sink co-move, blind corner filler.
- nudgeSelected 8258: custom → moveCabinet(exactWallDrag=true) with 1/8 rounding; cardinal → own setPlaced path with 1/10 rounding (!), clampCabinetsToRoom, snapWallCabinetToOwningWall, snapCabinetSeamOverlap.
- addCabinet catalog drop 5725-5745 & 3D drop 7828-7850: fork firstCollisionFreeCustomWallPlacement vs wallPlacementAt. 3D drop along 7763-7768: positionAlongWall vs center.x/y.
- setCabinetWallOffset 8090-8104 (generic: uses wallPlacementAt + moveCabinet exact).
- Snap-to-wall button 9320-9370 custom branch.
- rotateSelected 8128 / rotateCabinet 9404: snapPosition based (cardinal AABB).
- applyContinuousWallRoom 7580.
- Restore normalizers: 2984-2991, 4416, 9755 chain normalizeLegacyPeninsulaCabinets(clampCabinetsToRoom(normalizeBlindCornerDoorSides(normalizeLCornerDepths(...)))).
- Keyboard arrows 9548-9557 → nudgeSelected(step).
- data-testid="switch-to-floor-plan" toolbar. Nudge buttons at 12378-12408 (onClick nudgeSelected).

## PlanCanvas.tsx (HEAD)
- handlePointerMove ~935-1003: corner cabinets → nextAvailableRoomCornerPlacement; else orientToWall + snapPosition → onMove(dragUid, x, y, rot). handlePointerUp 1004.
- Drop 1120-1128: closestWall for custom else undefined targetWall → onDropNew.

## InteractiveRoom3D.tsx (HEAD)
- threeDRoomFacingRotation 5334: peninsula/custom → threeDPlanRotation(fallback); 45° angles → same; else infer wall from x/y (threeDPlacedWall / 6" tie rule).
- Body origin 5470-5480 lockedAngledCorner; legacy wall re-seat 5497-5520 (threeDLegacyWallAnchor) skipped for measured.

## Phase 1 plan
1. design.ts: add `wallRunFrame(side, room)` → {id,start:{x,y},end:{x,y},angle(rad),length,height,inward normal,kind}. Cardinal: from cabinetWallRunSegment + room.width/depth; custom: vertices; peninsula: peninsulaRunEndpoints. Add `roundToEighth`.
2. wallPlacementAt: cardinal branch returns wallId: side, wallOffset: clampedAlong (so every placement carries run metadata). wallRunOffset/wallRunSpan: prefer p.wallId===side && wallOffset finite for ANY wall kind; fallback to x/y.
3. Rename firstCollisionFreeCustomWallPlacement → firstCollisionFreeWallPlacement, run 1/8" search for all walls (keep old name as alias export for tests).
4. Generic `cabinetRunMovePreview` (drag/nudge/snap) used by moveCabinet for all walls: along = projection of center onto owned wall frame; magnet → magneticAvailableWallStart + firstCollisionFreeWallPlacement; freehand → clamp. Remove cardinal snapPosition/AABB path from moveCabinet for wall-owned cabinets; keep snapPosition only for island/free-floating (no wallId).
5. nudgeSelected: always route through moveCabinet(exact) with roundToEighth.
6. PlanCanvas drag: use cabinetWallDragPreviewAtPoint-like generic for owned-wall cabinets on all rooms; drop target: generic nearest wall frame.
7. InteractiveRoom3D: rotation uses saved rotation whenever cabinet.wallId is a known run (cardinal included) → threeDPlanRotation(saved); skip legacy re-seat when wallId present.
8. Tests: extend continuousWallPlacementParity.test.ts with B12/B36/W3030 standard vs wall-builder room parity (offset/size/rotation-relative) via wallPlacementAt/moveCabinet-preview functions.
9. Browser proof script /tmp/phase1_parity_proof.py: seed two drafts (rect room; wall builder rect room same dims via customWalls), place B12,B36,W3030 via draft, drag/nudge (ArrowRight)/snap, read localStorage draft, compare wallOffset to 1/8".

Draft seeding pattern: localStorage keys `cabinet-dealz:designer-draft:v2:owner:<email>` + active `cabinet-dealz:designer-draft:active:v2:owner`; go to /design, fill input[type=email], click "Launch Designer", dismiss beginner guide "I’ll explore first", click switch-to-floor-plan via evaluate. Style 330028.

## Phase 1 progress (22:45, 2026-09-29) — uncommitted working tree on HEAD 409dadec

Done in code (types pass, focused design/parity/3Dmovement tests 463/463 pass):
- design.ts: WallRunFrame model (wallRunFrame, roomWallRunFrames, wallRunAlongAtPoint, wallRunDistanceToPoint, nearestWallRunAtPoint, placedPlanCenter, seatedWallRunFrame, roundToEighth); wallPlacementAt cardinal branch now returns wallId/wallOffset; wallRunOffset/wallRunSpan via seatedWallRunFrame; firstCollisionFreeWallPlacement (alias firstCollisionFreeCustomWallPlacement) for all walls; paletteActiveWallPlacement uses direct spot, only 45°-family collisions go through 1/8" search; appendCollisionFreePlacements uses carriesRunGeometry instead of isCustomRoomWall; snapWallCabinetToOwningWall re-seats through run frame on all walls (corner bodies keep old path); cabinetCollisionDetail run-branch trusts cardinal wallOffset only when it matches x/y; NEW cabinetWallMovePreview(cabinet, point, room, peers, openings, {magnet, exact, target, wallId, seamToleranceIn}) shared engine.
- DesignTool.tsx: moveCabinet uses cabinetWallMovePreview for all wall-owned cabinets (free-floating fallback = old snapPosition path); nudgeSelected → moveCabinet(exact, roundToEighth) for all; catalog drop + 3D drop use firstCollisionFreeWallPlacement (no isCustomRoomWall); handleDropNew wall resolution via nearestWallRunAtPoint/wallRunFrame; snapSelectedToWall via cabinetWallMovePreview; 3D D-pad uses threeDSeatedWallMoveTarget + clampCabinetToRoom bounds; fridge surround depth fork removed.
- PlanCanvas.tsx: handlePointerMove uses cabinetWallMovePreview (fallback snapPosition for free-floating); dragOver/drop use nearestWallRunAtPoint; removed polygonRoom import.
- InteractiveRoom3D.tsx: threeDRoomFacingRotation uses seatedWallRunFrame (cardinal → frame.facingRotation); legacy re-seat / onMeasuredCustomWall via seatedWallRunFrame.
- designTool3DMovement.ts rewritten: threeDSeatedWallMoveTarget (alias threeDMeasuredWallMoveTarget), threeDPlanMoveDelta via wallRunFrame.
- Tests updated: design.test.ts 35 toEqual→toMatchObject for spots; designTool3DMovement.test.ts in/out expects null.

Full suite: baseline 67 failed/4151 passed → phase1 72 failed/4146 passed. 7 NEW failures: 6 are source-string assertions pinned to old fork text (PlanCanvas.automaticSnapping.test.ts, DesignTool.islandAndGlassCatalog.test.ts, DesignTool.universalCabinetAdjacency.test.ts x3, DesignTool.verticalMove.test.ts) + 1 behavioral: designToolRangeHoodPlacement.test.ts:29 (spot object now includes wallId/wallOffset → toEqual mismatch, likely just shape). 2 fixed vs baseline (server design.consult flaky).

Remaining Phase 1 TODO: update those 7 tests to new shared-engine text/shape; add parity test (B12,B36,W3030 standard vs wall-builder room) in continuousWallPlacementParity.test.ts; pnpm build; git diff --check; browser proof script /tmp/phase1_parity_proof.py (local dev server 3000; Floor Plan drag/nudge/snap in both rooms); ledger append; checkpoint; live verify; then STOP and report to user (one phase at a time).
