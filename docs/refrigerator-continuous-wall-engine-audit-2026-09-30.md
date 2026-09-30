# Refrigerator + Continuous Wall Builder Engine Audit

**Audited:** 2026-09-30 15:02 CT  
**Code changes made during this audit:** the shared refrigerator interaction fixes listed in the completion update below.

## Result

The Continuous Wall Builder is **not a separate cabinet designer**. It creates a `RoomData` polygon (`vertices` and `customWalls`) and then uses the same `DesignTool.tsx` state, catalog, popup, placement, pricing, material-list, and Three.js scene as the normal 3D Designer.

> The code is shared. The correction therefore wires the refrigerator assembly contract into the shared `DesignTool` action paths—not into a new Wall Builder refrigerator implementation.

The audit found three real shared-engine gaps, all corrected in the completion update below:

1. **Moving a refrigerator moves only the refrigerator.** `commitRefrigeratorAssemblyCandidate()` already exists in the shared engine, but no plan drag, 3D move, or nudge path calls it.
2. **Deleting a refrigerator silently deletes only the refrigerator.** The present code intentionally does not ask whether to remove the linked panels/cabinet.
3. **Clicking a placed refrigerator does not reopen the Refrigerator Options popup.** The popup opens on new placement, a duplicate refrigerator catalog action, a pre-save repair warning, or an incompatible upper—but not via the placed refrigerator’s normal selection action.

The visible screenshot is consistent with an assembly whose members were positioned independently after initial placement. That is exactly what the unused shared move helper is meant to prevent.

---

## 1. Exact 3D Designer refrigerator implementation

| Requirement | Exact location | What it does now |
|---|---|---|
| Refrigerator Options popup component | `client/src/components/design/RefrigeratorOptionsDialog.tsx` — `RefrigeratorOptionsDialog()` (line 198) | The one popup used by the Designer. |
| Popup dimension choices | Same file — `FRIDGE_WIDTHS`, `FRIDGE_HEIGHTS`, `FRIDGE_DEPTHS` (85–87); bridge width/height/depth choices (89–99) | Width: 24/27/30/33/36/42; height: 66/70/72/78/84; depth: 24/27/30/33/36; bridge: 30/33/36 W, 12/15/18/21/24 H, 12/24 D. |
| Popup defaults | Same file — local state (219–239), reset effect (315–335) | 36 × 70 × 30 refrigerator; **Add Cabinet**; 36 × 12 × 12 cabinet above; **Both** end panels; first source-backed panel; no smooth panel. |
| Availability block | Same file — `bridgeByDims`, `hasRequiredBridge`, `hasRequiredPanels`, `canApply` (246–313), disabled Apply (668–670) | A missing cap or panel prevents Apply. The popup also visually marks unavailable height/depth combinations. |
| Source/catalog availability | `server/routers/design.ts` — `surroundForFridge` (573–717) | Returns only active, available, published, selected-style `deepAbove`, `bridgeAbove`, `endPanels`, and `smoothPanels`; explicitly supports `REP2496` and excludes raw `PLYEB42` as an auto refrigerator panel. |
| Shared catalog request | `client/src/pages/DesignTool.tsx` — `trpc.design.surroundForFridge.useQuery` (2581–2584) | Loads the chosen style’s real catalog parts before a refrigerator is completed. No Wall Builder branch. |
| Popup mount | `client/src/pages/DesignTool.tsx` — `<RefrigeratorOptionsDialog>` (15715–15728) | One mounted component for the entire DesignTool, including drawn-wall rooms. |
| Opening popup after refrigerator placement | `client/src/pages/DesignTool.tsx` — `addCabinet()` refrigerator branch (5416–5424) | Sets `fridgeDialog` after a `FRIDGE-*` item is placed. |
| Build from user choices | `client/src/pages/DesignTool.tsx` — `applyFridgeSurround()` (6590–7005) | Replaces old assembly members, resizes the refrigerator from selected dimensions, chooses real catalog cap/panel records, places both panels/cap, validates them, and commits one normalized result. |
| Exact refrigerator run/opening | `client/src/lib/design.ts` — `refrigeratorBayRunMetrics()` (6646–6665) | Uses source span plus **½″ clearance on each side**: 36″ fridge → 37″ clear opening. Uses wall-run geometry, not a Three.js bounding box. |
| Cabinet-above placement | `DesignTool.tsx` — `applyFridgeSurround()` (6698–6842) | Centers the catalog cap on the refrigerator’s run center, uses its catalog depth, creates real cap fillers if needed, and assigns `refrigeratorAssemblyId` + `bridge` role. |
| Panel placement | `DesignTool.tsx` — `placePanel()` (6854–6927) | Uses verified panel depth/thickness and places Left/Right outside the opening; assigns `left-panel` / `right-panel` roles and source SKU. |
| 2″ clearance elevation rule | `client/src/lib/design.ts` — `refrigeratorSurroundElevation()` (6913–6920) | The shared rule sets refrigerator upper bottom to **72″**. With a 70″ refrigerator this is a 2″ clearance. |
| Fit/collision handling for entire enclosure | `client/src/lib/design.ts` — `fitRefrigeratorEnclosurePlacements()` (3577–3705), `appendRefrigeratorEnclosurePlacements()` (3712–3731) | Tries to shift the refrigerator plus its new cap/panels as a unit and rejects an incomplete selected-panel result. |
| Persistent ownership and restore normalization | `client/src/lib/design.ts` — `reconcileRefrigeratorAssemblies()` (6811–6905), `normalizeRefrigeratorBayUppers()` (6947–7009) | Carries durable assembly IDs/roles and normalizes bridge centering, 72″ mount, and panel cap height. |
| Shared group-move helper (currently unused) | `client/src/lib/design.ts` — `commitRefrigeratorAssemblyCandidate()` (6789–6802) | Exactly the shared helper needed to move refrigerator + selected members together. It is not yet called by plan drag, 3D move, or nudge. |

### Panel-height correction

The owner’s observation is correct:

> A **70″ refrigerator + 2″ required clearance + 12″ cabinet above = 84″ finished panel height**.

The popup currently displays **82″** because it uses `fridgeH + bridgeHeight` (`RefrigeratorOptionsDialog.tsx` 293–296 and 583–587), omitting the mandatory clearance. The actual shared build uses `refrigeratorSurroundElevation()` and makes the bridge run from 72″ to 84″, so it currently builds the panel to **84″**. The popup’s display/value contract must be corrected to match the shared build rule.

---

## 2. Shared snap, collision, walls, corners, fillers, countertops, price, invoice, and materials

| Function | Exact location | Shared behavior |
|---|---|---|
| One run model | `client/src/lib/design.ts` — `WallRunFrame`, `wallRunFrame()`, `roomWallRunFrames()` (8609–8689) | Standard walls, drawn walls, and peninsulas expose one `{ id, start, end, angle, height, inward face }` model. |
| Placement | `design.ts` — `wallPlacementAt()` (8473), `wallPlacementAtUnbounded()` (8573) | Places by physical run offset on all walls. The unbounded variant preserves a temporary start-side refrigerator panel until the whole enclosure fitter can shift the assembly. |
| 1/8″ snap / drag / nudge | `design.ts` — `roundToEighth()` (8605), `cabinetWallMovePreview()` (7762) | Same 1/8″ along-wall movement engine for standard and drawn walls. |
| Collision | `design.ts` — `cabinetCollisionDetail()` (2622), `hasCollision()` (3167), `appendCollisionFreePlacements()` (3393) | One collision system, including rotated bodies. |
| Keep cabinet inside room | `design.ts` — `containCabinetOnDrawnWalls()` (9042), `clampCabinetToRoom()` (9102) | Drawn rooms use the actual polygon shell; standard rooms use the rectangular shell. Both are entered through the one clamp function. |
| 90°/45° corners | `design.ts` — `wallRunJoinAt()` (8706), `insideCornerHoldIn()` (8725), `wallRunCornerPlacement()` (8032), `customWallTrueCornerPlacement()` (8056) | One inside-corner rule: 45° has an 11″ hold, 90° has no hold. |
| Fillers | `design.ts` — `isFillerItem()` (220), `buildRequiredBlindCornerFiller()` / related filler functions; `DesignTool.tsx` — real catalog filler selection inside `applyFridgeSurround()` (6803–6840) | Filler pieces are source-backed placed parts, not synthetic shapes. Refrigerator cap fillers receive assembly roles. |
| One countertop per base run | `design.ts` — `countertopSurfaces()` (11289–11420), `mergeContiguousBaseCountertopRuns()` (11204–11287) | Bases merge by physical contiguous run. Refrigerator/tall/appliance breaks have no countertop support, so the slab stops at the panels. 45° measured-wall surfaces use `miteredMeasuredWallCountertopSurfaces()`. |
| 3D countertop rendering | `client/src/components/design/InteractiveRoom3D.tsx` — `addThreeDMeasuredWallMiterCountertops()` (5646), scene path around 8616–8630 | Drawn-wall 3D rendering consumes shared `countertopSurfaces()` output; it does not build separate per-cabinet tops. |
| Pricing / cart | `client/src/pages/DesignTool.tsx` — `buildDesignCabinetCartLines()` use around 3218–3260; `cartableLines` around 3540–3565 | Every placed cap/panel/filler contributes by real `cabinetId`, master code, style, and source price. |
| Invoice / build sheet | `DesignTool.tsx` — `buildRows` (3046 onward) | Groups the actual `placed` parts into build-sheet rows. |
| Materials list | `DesignTool.tsx` — `buildMaterialsListRows()` call (4337); `client/src/lib/designMaterialsList.ts` — `buildMaterialsListRows()` | Consumes the build/pricing rows, including real refrigerator panels and caps. |

---

## 3. Continuous Wall Builder-specific code (the requested copy audit)

### Refrigerator/panel/cabinet/catalog/price copies: **none found**

There is **no separate Wall Builder refrigerator popup**, no separate fridge-bay builder, no separate end-panel placer, no separate refrigerator catalog query, no separate price/invoice/materials builder, and no separate continuous-wall cart model.

| Wall Builder-specific location | Purpose | Refrigerator/cabinet logic? |
|---|---|---|
| `client/src/components/design/WallBuilder.tsx` | Collects measured wall lengths and turns; calls `wallBuilderRoomGeometry()` | **No**. It never imports the fridge dialog, catalog, placed cabinets, pricing, panels, countertop, or Three.js. |
| `client/src/lib/polygonRoom.ts` — `wallBuilderRoomGeometry()` (546 onward) | Turns the user’s wall sequence into `vertices`, `customWalls`, width, depth, and open/closed-path metadata | **No**. This is the allowed small wall adapter. |
| `client/src/pages/DesignTool.tsx` — `applyContinuousWallRoom()` (7600–7629) | Installs that adapter output into shared `RoomData`, selects first wall, and opens plan view | **No**. It transfers only wall geometry. |
| `client/src/components/design/PolygonRoomEditor.tsx` | Edits drawn wall geometry | **No**. It does not place refrigerator components. |
| `client/src/lib/design.ts` — `continuousWallApplianceSnapInfo()` (8917 onward) | Measures adjacent seams on a drawn run using shared run geometry | **No copy**. It is a small adapter/helper for a measured run, not a fridge bay builder. |
| `client/src/components/design/InteractiveRoom3D.tsx` — `threeDMeasuredWallSegments()` (2853), `addThreeDMeasuredWallMiterCountertops()` (5646) | Renders the drawn wall planes and shared countertop surfaces in 3D | **No catalog or placement copy**. |

### The true shared-action gaps to correct

| Required user behavior | Current shared code | Required shared correction |
|---|---|---|
| Move fridge + panels + cap together | `moveCabinet()` (7921–8035) and `moveCabinetFrom3D()` (8292 onward) move only selected `uid`; the existing group helper is not called | On refrigerator move, feed the positioned refrigerator candidate to `commitRefrigeratorAssemblyCandidate()` before collision/commit. This applies identically to standard and Wall Builder rooms. |
| Delete asks whether to remove linked parts | `requestCabinetDeletion()` (8171–8176) deliberately deletes only the refrigerator | Add a shared confirmation path based on `refrigeratorAssemblyMembers()`; remove all or just fridge according to the chosen action. |
| Click placed refrigerator reopens options | Only new placement (5417–5424), duplicate catalog click (4441–4450), or pre-save repair (4071–4075) opens `fridgeDialog` | Add one shared `onEditRefrigerator` action to the normal selected-cabinet UI and invoke the same `setFridgeDialog({ fridgeUid })`. |
| Popup says 82″ for a 70″ fridge plus a 12″ cap | Popup computes `fridgeH + bridgeHeight` | Use shared `refrigeratorSurroundElevation()` / its 72″ mount datum: display and persist the cap top at 84″. |

---

## 4. Existing proof coverage and the required new proof

Existing coverage already proves pieces of shared behavior:

- `client/src/lib/oneEngineWallParity.test.ts`: B12/B36/W3030 run placement, drag, nudge, 1/8″ snap, and legacy backfill parity.
- `client/src/lib/continuousWallPlacementParity.test.ts`: drawn-wall placement, inside-room containment, countertop edge, refrigerator countertop breaks, and a group helper’s intended move behavior.
- `client/src/lib/design.refrigeratorAssembly.test.ts`: source dimensions, ½″ side clearance, 0″ bridge-center offset, end panels, 72″ refrigerator upper datum, and 45° wall enclosure fitting.
- `client/src/components/design/RefrigeratorOptionsDialog.test.tsx`: source-only availability and default Both panel selection.

The requested guard is still missing: one fixture must build the exact **36 × 70 × 30 refrigerator; 36 × 12 × 24 cap; both REP2496 panels; bases on both sides; one 45° and one 90° corner** in standard and Wall Builder rooms, then compare codes, run positions, panels, fillers, countertop polygons, and price total. The same test must cover moving, deleting, reopening, and switching Both → Left.

## Completion update — shared interaction fixes

The audited gaps are now fixed in the **same `DesignTool` and `design.ts` path** used by both the normal Designer and the Continuous Wall Builder:

| User requirement | Completed shared correction |
|---|---|
| 70″ refrigerator + 2″ clearance + 12″ cabinet = 84″ finished panel | `REFRIGERATOR_UPPER_CLEARANCE_IN = 2` is the shared elevation constant. The popup now displays and passes **84″**, and the shared build/normalization starts the cap at refrigerator top + 2″. |
| Cap and selected panels move with the refrigerator | `commitRefrigeratorAssemblyCandidate()` now repositions the refrigerator, bridge, cap fillers, and selected panels on the target wall run. Plan drag, plan nudge, measured wall offset, Snap to wall, and 3D moves all call that transaction. It rejects an invalid group move rather than leaving separated parts. |
| Clicking/editing a refrigerator reopens its attributes | Normal selection and the existing Attributes entry point reopen `RefrigeratorOptionsDialog`. The popup receives the current refrigerator, cap, and panel choices as its initial values. |
| Deleting the refrigerator needs a choice | A linked refrigerator now presents **Keep refrigerator / Remove refrigerator only / Remove complete bay**. |
| Same behavior in both tools | No Wall Builder refrigerator implementation was added. The change stays in shared `DesignTool.tsx` and `design.ts`, so a polygon room takes the exact same catalog, geometry, collision, price, invoice, and materials path. |

Focused validation passed locally after the change: **486 refrigerator/geometry/UI tests**, TypeScript, production build, and whitespace integrity.

## Recommended implementation boundary

1. Keep `WallBuilder.tsx` and `polygonRoom.ts` limited to wall measurements and the `RoomData` adapter.
2. Extract the refrigerator interaction transaction out of `DesignTool.tsx` only if needed to make a single callable shared action; do not create a Wall Builder variant.
3. Wire all selection/move/delete actions in **one** `DesignTool` path so standard and drawn rooms necessarily behave identically.
4. Correct the panel-height UI to the 72″ refrigerator-cap datum.
5. Add the parity guard, then prove it locally and on live CabinetDealz before claiming completion.
