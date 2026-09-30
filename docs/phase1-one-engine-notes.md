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

## Phase 1 finish-up (user re-scoped at 00:02 2026-09-30): status at 00:08 — UNCOMMITTED working tree on top of 843e28b4

User instructions: (1) confirm Phase 0 revert; (2) finish A1-A7, A9-A15, A16 (start with A1; close resize+rotate so they refresh wallOffset; then remove A1); (3) add one-time wallId back-fill for saved designs (section C of docs/wall-branch-residual-inventory.md); (4) parity proof B12/B36/W3030 standard vs Wall Builder room, table of position/offset/size to 1/8" after drag, drop, nudge, snap, resize, rotate + screenshots. STOP there; no takeoffs/views until approved.

Done so far (design.ts + DesignTool.tsx):
- A1/A10: `seatedWallRunFrame` kind-agnostic; `alongRunSpan(p)`; `wallRunOffset`/`wallRunSpan` trust offset on every kind; new `reseatOnWallRun(p, room)` + `syncWallRunOffsets(placed, room)`; DesignTool `setPlaced` = useCallback wrapper over `setPlacedState` running `syncWallRunOffsets(next, roomRef.current)` (roomRef added; `type SetStateAction` imported). Cardinal guard in `cabinetCollisionDetail` removed.
- A2-A6, A11 collapsed (/tmp/patch_a2.py). A3 withinRoom uses `clampCabinetToRoom` identity.
- A7/A9/A15 (/tmp/patch_a7.py): new `wallRunJoinAt(frame, at, room)` + `insideCornerHoldIn(turnDeg)` after `roomWallRunFrames`; `freeSegmentsOnWall` uses frame.runStart/runEnd, join-angle hold on every perimeter wall, corner-adjoining reservation = corner envelope projected via `wallRunAlongAtPoint` (~line 7498 `frame!`); `alternateWallPlacementRecommendation` iterates `roomWallRunFrames`.
- Triage: `python3 /tmp/difffail.py <json>` vs /tmp/p2-baseline-vitest.json (65 baseline failures). Focused run: `pnpm exec vitest run client/src/lib client/src/pages client/src/components/design --reporter=json --outputFile=/tmp/p2-a7.json`.
- NEW failures now (2): design.test.ts:2536 BBC-36 adjoining start 24.000000000000004 (float → roundToEighth the projected bounds); design.test.ts:4406 W3042 right-drag into WDC contact returns null (cabinetWallDragPreview path; check freeSegments reservation on the WDC leg).

Remaining: fix 2 failures; A12 fold `cabinetWallDragPreview` (design.ts ~11912; consumers InteractiveRoom3D ~9250/9272 use {disableSnapping}, preview.freehand/.fit, threeDCabinetWallDragText, smallGapFillerOpportunityFromDragPreview — keep return shape); A13 delete `autoSnapCabinetToNearbyWall`; A14 `nextAvailableRoomCornerPlacement` (~8075; callers DesignTool 4632/7699, PlanCanvas 963); A16 rotatePlan.ts 71/77/104; A17 InteractiveRoom3D 5356/5450; section C back-fill in restore chain (DesignTool 2984/4416/5697/7736/9595 near normalizeLegacyPeninsulaCabinets: back-fill wallId via cabinetWall()+projected offset then syncWallRunOffsets); tests (resize/rotate refresh offset; back-fill; parity+resize/rotate); browser proof /tmp/phase1_parity_proof.py extend with resize (setCustomWidth ~8821/setCustomDepth ~8899) + rotate (rotateSelected ~8082); ledger; checkpoint; live proof.

## Live verification state (02:40, 2026-09-30)
- Checkpoint bd163359 saved 01:56 (Phase 1 finish-up done, ledger appended). Local build chunks: index-6osgOWdy.js, DesignTool-CYpmzfL4.js.
- Live www.cabinetdealz.com at 02:39 still serves index-D-QH7awc.js / DesignTool-D89jCI99.js (deploy of 843e28b4); intermittent empty HTML responses (possible deploy in progress). Live proof run at 02:21 (0 mismatches) was against the OLD bundle — not valid proof of bd163359.
- Proof script: /tmp/phase1b_parity_proof.py [BASE_URL]; outputs /tmp/phase1b-proof-output.txt, /tmp/phase1b-proof-results.json, /tmp/phase1b-{standard,drawn}-floorplan.png. Local results in docs/proofs/phase1-finish-*.
- Next: poll until live DesignTool chunk != D89jCI99, rerun live proof, save to docs/proofs/phase1-finish-live-parity-output.md, ledger note, checkpoint. Then STOP and report Phase 1 finish-up (Phase 2 not started).

## User follow-up (05:13, 2026-09-30) — 4 items before Phase 2; then STOP for OK
1. Phase 0 revert confirmed: `cabinetWallDragPreviewAtPoint` 0 refs; PlanCanvas has no `handlePointerMove(e)` in pointerUp. (design.ts diffs since 409dadec are Phase 1 work, not the reverted change.)
2. Back-fill: ADDED `backfillLegacyWallRuns(placed, room)` in design.ts (after syncWallRunOffsets ~line 8858); wired into DesignTool restore chains at ~2995 (saved design) and ~9606 (draft), import on line 125. Unit regression appended to oneEngineWallParity.test.ts (14/14 pass). tsc passes. UNCOMMITTED.
3. Extended proof: /tmp/phase1c_parity_proof.py (steps: start, drag_toward_anchor, nudge_right_3in, drag_past_run_end, drag_back_to_60, rotate_90, rotate_180, depth_move_in_1, snap_to_wall_button, width_resize, catalog_drop; plus legacy_standard/legacy_drawn scenarios seeded WITHOUT wallId/wallOffset → "restored" + "nudge_right_1in"). Outputs /tmp/phase1c-proof-output.txt, /tmp/phase1c-proof-results.json, /tmp/phase1c-{standard,drawn,legacy-standard,legacy-drawn}-floorplan.png.
   UI facts: Snap-to-wall WallPicker (`button[title="Snap to back wall"]` standard; `button[title^="Snap this cabinet to "]` drawn) is rendered ONLY in the mobile selection Sheet (isMobile = useIsMobile(1024), DesignTool ~12288 `isMobile && selectedCab`), so proof must use a <1024px viewport (set_viewport_size 1000) — currently still failing to find it; may need to open the sheet (check how the Sheet opens on mobile after selecting: maybe `mobilePanel`/tap). Width resize: Attributes dialog (dblclick cabinet, or header "Attributes" button) → `[role="dialog"] input[aria-label="Width in inches"]`; commits via onSetWidth→setCustomWidth (0.1" increments, snapPosition+seam). Depth move: `[data-testid="cabinet-depth-move-controls"] button[title^="Move in"]`. Palette: tab buttons text "Base"/"Wall", search `input[placeholder^="Search by name"]`, item `button[draggable]:has(div.font-mono:text-is("B36"))`; drop on `[data-room]` (PlanCanvas onDrop → handleDropNew).
4. Live: as of 03:11 live still served 843e28b4 bundle (DesignTool-D89jCI99.js); user says they will publish. Then run `python3 /tmp/phase1c_parity_proof.py https://www.cabinetdealz.com`, verify bundle hash changed first.
Remaining: finish proof run locally → ledger append → checkpoint → wait for user publish → live proof → stop.

## 06:19 state
- Fixed one more fork found by the extended proof: `designTool3DDropPlacement.ts` (targetedSinkBaseForThreeDDrop / targetedLowerCabinetForThreeDDrop) used `horizontal ? x : y` cardinal projection → a W3030 palette-dropped over the B36 in a DRAWN room landed free-floating (x=108.18,y=6.14, no wallId). Now uses wallRunFrame/wallRunAlongAtPoint/wallRunOffset/wallRunSpan. Probe after fix: standard top/99, drawn cw_munkhqc4_4/99, identical x,y. Regression added to oneEngineWallParity.test.ts (16/16 pass). DesignTool.peninsulaRestore.test.ts updated for the backfill wrapper.
- Full suite before this fix: only NEW failures vs baseline were 2 server consult timeouts (network, pre-existing flaky) + peninsulaRestore (now fixed). tsc/build/diff-check OK.
- Palette display code is `W-3030` (masterCode saved as W-3030); proof matches with hyphen stripped.
- Next: rerun /tmp/phase1c_parity_proof.py locally (expect MISMATCHES 0), ledger append, checkpoint, then STOP and wait for user's publish → rerun on live.

## Height-rule correction (08:49, 2026-09-30) — uncommitted on top of ee625090
User rule: ONE room ceiling (84–144", Wall Builder never changes it); each drawn wall has own height ≤ ceiling (short pony wall allowed, NOT clamped to 84); uppers/crown limit = min(wall height, ceiling).
Root cause of "Measured back run 108"": Phase 2 wallCeiling() took customWall.height through clampCeilingHeight (84–144) as THE ceiling — wall height was treated as ceiling; the proof fixture set wall 108 in a 96 room. Wall Builder defaults wallHeightIn=room.ceilingHeight (DesignTool 16173/16608) — fine.
Fix (shared): design.ts new `wallTopLimit(room, side)` = min(roomCeiling, max(34.5, eighth(wall.height))); `MIN_WALL_HEIGHT=34.5`; wallCeiling() uses it; wallRunFrame custom branch uses it; ElevationView uses wallCeiling for all walls (customWall kept only for label); InteractiveRoom3D measured wall plane heightIn=wallTopLimit; DesignTool saveWallSettings clamps to [MIN_WALL_HEIGHT, roomCeiling] and input max={roomCeiling(room)}.
Remaining: polygonRoom.ts clamps (34.5..144) at ~257/310/559 have no room context — capped downstream by wallTopLimit; Phase 3 moves them to design.ts constants.
Tests updated: oneEngineTakeoffParity (108 in 96 room→96; full-height 108/108 = standard; 42" pony wall caps upper, violation flagged, maxBottom 12), ElevationView.customWall.test (384px not 432px). Browser proof /tmp/phase2_views_browser.py seeds wall 108 in 96 room — must now show 96; add a 42" short-wall scenario.
Also pending for Phase 2 approval: (1) crown/toe/rail table std vs WB incl rotated + 1" pulled (oneEngineTakeoffParity has numbers), (2) a REAL photo render finished from a Wall Builder room (Photo Quality gated on signed-in user + saved design + isCurrentPlanSaved + door reference ready). Live bundles fe1e747e1 verified.

## 09:02 state — height fix done locally, validation running
- Height fix applied (wallTopLimit etc.) + conflict message wall-aware + new i18n key `dt_ev_wall_top` ('Wall top {n}" (ceiling {c}")', es too) used in ElevationView when wall top < ceiling. tsc clean. oneEngineTakeoffParity 11/11.
- /tmp/phase2_views_browser.py now has 3 scenarios standard/drawn(108 in 96 → label 96)/pony(42 → label 42, W3030 CONFLICT badge, message "stands above the top of its 3'6" half wall"). All pass locally; screenshots /tmp/phase2-local-{standard,drawn,pony}-{elevation,3d}.png. Output /tmp/phase2-heights-local.txt.
- Background validation started 09:00 (session p5bg): /tmp/p5-full.json, /tmp/p5-fail-diff.txt (vs baseline via /tmp/difffail.py), /tmp/p5-build.txt (build=rc), /tmp/p5-diffcheck.txt, /tmp/p5-done.txt when finished.
- Photo render paths: (a) PUBLIC `trpc.design.photorealPreview` (server/routers/design.ts:2679) used by client/src/components/design/PhotorealPreview.tsx via buildScene (=DesignTool buildPhotorealScene, Phase 2 fixed for custom walls) → returns {url}. This is the real "photo render" a guest can finish. Need to find where PhotorealPreview is mounted/triggered in DesignTool (prop onBeforeOpen, controlledOpen). (b) Photo Quality (InteractiveRoom3D ~8000) = Gemini deterministic flow: `designPhotoRenders.create` requires phone-verified saved design (non-admin) or admin; `startGeminiImageTest` admin-only, needs 1920x1080 JPEG; GEMINI key present in .env.
- Remaining before stopping: wait validation → ledger append → checkpoint → live verify (bundle hash/content) → rerun /tmp/phase2_views_browser.py against live → photo render proof (path a) from WB room → report: height explanation, takeoff table (from oneEngineTakeoffParity: crown/toe/rail values), photo render, then WAIT for Phase 3 OK.

## 09:27 Gemini admin photo test (user request 09:25) — NO code/price changes allowed
- Room fixture generated via shared engine → /tmp/gemini-fixture.json: walls cw_..._5 "Main wall" 144" h96 (B24@0, B12@60, B36@96, W3030@60), cw_..._6 "45° wall" 72" lockedAngle 45 h96, cw_..._7 "Half wall" 96" h42; vertices (0,0),(144,0),(194.91,50.91),(194.91,146.91); openWallPath; ceiling 96. Temp test file already deleted; tree clean at 55e8a6f0.
- Cloud browser (manus-tools browser_*) is NOT signed in on www.cabinetdealz.com. Sign-in page https://www.cabinetdealz.com/signin has email/password form (#login-email/#login-password) + Google/Apple/Microsoft OAuth. Need user takeover to log in as admin.
- After login: seed draft into localStorage key `cabinet-dealz:designer-draft:v2:owner:<email>` + active key `cabinet-dealz:designer-draft:active:v2:owner` (format {v:2, originScope:"owner", room, placed, openings:[], island:null, styleId:330028,...} — see /tmp/phase1c_parity_proof.py draft_for), reload /design, 3D View, click "Photo Quality" (InteractiveRoom3D ~9500; admin path isPhotoQualityTest → startGeminiImageTest needs 1920x1080 JPEG locked capture, designId 0 = administrator snapshot allowed), poll getGeminiImageTestJob; save the resulting image to docs/proofs/.

## 09:45 user bug: corner upper on angled wall rendered backwards. Then STOP (screenshot of same room fixed).
Probe file client/src/lib/zz-probe.test.ts — DELETE before commit. Fixture /tmp/gemini-fixture.json (walls cw_muo77uac_5 main 144 h96 @0°, _6 45° 72 h96, _7 half 96 h42; B24@0,B12@60,B36@96,W3030@60 on main). Cloud browser NOT signed in.
ROOT CAUSES:
1. 3D corner facing split 3 ways in InteractiveRoom3D: threeDRoomFacingRotation returns -fallback for l-shape (mirror), +fallback for diagonal/triangle/corner-drawer; existingCabinetTransform applies diagonalCornerRoomRotation only on legacy (no wallId) path. Seated WDC2442 at top-right/bottom-left of a STANDARD room and at drawn 90° joins lands its back corner 34" off the vertex (backwards); WTC/CDB/BTC wrong at top-right/bottom-left both seated and legacy. All corner bodies authored with wall corner at local back-left (-w/2,-d/2), plan rot 0 = top-left → correct rule: 3D rotation = threeDPlanRotation(planRot) for ALL corner kinds (same as standard cabinets).
2. Move engine cabinetWallMovePreview never corner-seats corner cabinets on drawn walls (WDC on 45° wall → wallOffset 11, back 11" from vertex; on main near join → 35" away). Standard rooms use the cardinal-only branch design.ts ~12026 (requiresRoomCornerPlacement → wallPlacementAt corner + cornerRotationForPlaced). Fix: shared corner seat wallRunCornerPlacement/wallRunJoinAt in the move engine for any wall kind.
3. PlanCanvas planCabinetClipPath/planDiagonalFrontPath use cornerRotationForPlaced (rectangle inference) unless 45° locked → wrong notch for seated corner at drawn 90° join; should use saved rotation when seated.
Tests to watch: InteractiveRoom3D.test.ts:1913 (diagonalCornerRoomRotation map), :2703 erb 1.5π, :3123/3180 cdb 0, :3449 wdc.
## 10:10 NEW user bug (do after corner fix, then STOP): fridge enclosure on Wall Builder walls — no panels, shallow upper at wall instead of 24"-deep fridge cabinet, fridge pulled off wall. (1) find why skipped/wrong wall; (2) fix shared code; (3) panels+deep cabinet on invoice/materials in both rooms; (4) test + screenshots both rooms.
### 10:19 corner-facing fix state (uncommitted)
- DONE in InteractiveRoom3D.tsx: (a) threeDRoomFacingRotation: seated true-corner body → axis from run facing (sameAxis ? facing : savedTurn), then threeDPlanRotation; legacy corner kinds → threeDPlanRotation(plan turn) for ALL kinds (removed l-shape-only mirror + raw fallback). (b) existingCabinetTransform: planRotation = cornerTurn ?? savedRotation (removed diagonalCornerRoomRotation pre-rotation; function deleted). Test expectation CDB36@BL: PI/2. InteractiveRoom3D.test.ts 359 pass.
- Probes (/tmp gemini fixture rotated 0/90/180/270): all corner bodies + W3030 back edge on wall, front into room on 0°/45°/90° drawn walls → 0 BAD. Standard room 4 corners: back-corner error 0 for WDC/WER/LSB/CDB/BTC legacy+seated.
- REMAINING: (2) move engine cabinetWallMovePreview does not corner-seat corner cabinets at a 90° join on drawn walls (3DbackErr 11–35 when dropped near a join) → add wallRunCornerPlacement step for requiresRoomCornerPlacement bodies near a run end (any wall kind); (3) PlanCanvas clip uses cornerRotationForPlaced (rectangle inference) — make it use saved rotation when seated (seatedWallRunFrame) ; (4) test file oneEngineCornerFacing.test.ts: corner upper+base at 90° and 45° corners, standard+drawn; (5) screenshot of gemini room fixed (Playwright /tmp/phase2_views_browser.py pattern, 3D view); delete zz-probe*.test.ts; ledger; checkpoint. Then fridge enclosure bug.

## 15:17 CT — NEW user bug: fridge side panels "Accept" does nothing on Continuous Wall room (works in standard room)
- Data Recovery tab shipped in b413729e and verified live (Admin-COqNsNgd.js contains data-recovery-admin).
- Accept path: RefrigeratorOptionsDialog.handleApply (line ~361) → DesignTool.applyFridgeSurround (line 6616). Silent returns found so far: `if (!fridge || !surround) { setFridgeDialog(null); return; }` (6643); `placePanel` inner `return` on missing panel depth only exits the inner fn. Panel placement: wallPlacementAtUnbounded(along, pThick, pDepth, side, room) with side = refrigeratorBayRunMetrics(fridge, room).side, then fitRefrigeratorEnclosurePlacements + appendRefrigeratorEnclosurePlacements (design.ts 3577/3712). Need repro via Playwright on local with the Wall Builder fixture (/tmp/gemini-fixture.json, /tmp/refrigerator_live_proof.py has draft seeding for both rooms).
