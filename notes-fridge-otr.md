# Fridge/OTR feature — key facts & state

## Real catalog SKUs (from DB `cabinets`)
- Bridge (shallow, 12" deep) wall cabinets: `W-30-12 / W-30-15 / W-30-18`, `W-33-*`, `W-36-*` (heights 12/15/18)
- Refrigerator WALL cabinet (deep 24"): `W-30-12-24 / W-30-15-24 / W-30-18-24 / W-30-24-24`, plus `W-33-*-24`, `W-36-*-24`
- Refrigerator END PANEL (tall/deep, vertical, L/R of fridge): `REPV-24-96` (24w x 96h x ~1d), `REPV-27-96` (27w). subCategory "Decorative End Panel"
- Smooth refrigerator PANEL (flat skin sheet, 1/4"): `WSV-24 / WSV-30 / WSV-36 / WSV-42` "Wall Skin Panel (cut to fit)". subCategory "Skin Panel"
- Pantry (96" tall, 24" deep utility): `U-18-96-24 / U-24-96-24 / U-30-96-24` (also UC1896/UC2496). Family `U-{w}-{h}-24`
- Appliances (client design.ts APPLIANCES): FRIDGE-30 (30w,30d,70h), FRIDGE-36 (36w,30d,70h), MW-30 (OTR, 30w,15d, elevBottom 54, elevHeight 17), RANGE-30

## STD constants (design.ts)
BASE_HEIGHT 34.5, WALL_HEIGHT 30, WALL_DEPTH 12, WALL_MOUNT_BOTTOM 54, TALL_HEIGHT 84, BASE_DEPTH 24. WALL_CABINET_TOP=84. wallCabinetTopLine(room) => 84 on 8ft, higher on taller ceilings.

## Done
- design.ts helpers: isOverRangeMicrowave, bridgeCabinetCodeForWidth (snaps 30/33/36 -> W-{n}-12), isRefrigerator. All unit-tested in server/designStackingRules.test.ts (32 tests pass).
- Collision engine already exempts cross-zone (upper vs floor) and isBridgeOverRange — so fridge upper + panels don't false-collide.
- DesignTool addCabinet: OTR microwave auto-centers over nearest RANGE on same wall, sets mountBottom to MW elevBottom, toasts snap + bridge suggestion.
- Fridge placement opens RefrigeratorOptionsDialog (new component components/design/RefrigeratorOptionsDialog.tsx). applyFridgeSurround places: cabinet above (deep/bridge/none, top-aligned to wallCabinetTopLine), end panels (L/R/both, full height flush to fridge edge), optional smooth WSV panel.
- Server: design.ts router `surroundForFridge({styleId, fridgeWidth})` returns {deepAbove, bridgeAbove, endPanels, smoothPanels} gated to buyable-in-style.
- i18n EN/ES keys added: dt_otr_*, dt_fridge_*, dt_preset_builtin_fridge* (site.ts). Parity test passes.

## TODO (remaining)
- Phase 4: Built-in Refrigerator + Pantry End preset (server builtinFridgeRun proc + client preset action + toolbar entry). Continuous crown = existing `crown` state toggle via setCrown(true) + trimOverride.current.crown=true. Crown auto-enables when hasWallCab anyway.
- Phase 5 i18n mostly done (preset keys already added).
- Phase 6: full test suite + screenshot verify.
- Phase 7: checkpoint + deliver.

## Trim/crown mechanism
`const [crown,setCrown]=useState(false)` + `trimOverride.current.crown`. Crown auto-enables when wall cabs present (effect ~line 1404). Continuous crown across the run is automatic once wall cabs + pantry exist; preset should setCrown(true).

## Preset placement plan
Place along activeWall from the wall end: [end panel][pantry U-{w}-96-24][fridge FRIDGE-36 + REPV end panels + W-{w}-*-24 deep upper over it top-aligned 84"][surrounding W-*-* 36"? note: 36" wall cab = W-{w}-30 mounted at 54..84]. Use wallPlacementAt/nextFreeSpotOnWall. Enable crown.
