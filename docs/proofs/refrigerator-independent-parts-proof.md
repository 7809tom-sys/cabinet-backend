# Independent Refrigerator Parts — Proof

**Date:** 2026-10-01

## Rule now enforced

A refrigerator is placed from **its own catalog width and footprint**. It does **not** require an over-refrigerator cabinet, side panels, cap fillers, or any other grouped “bay” pieces.

| Choice in Refrigerator Options | Default | Result |
|---|---:|---|
| Refrigerator appliance | Yes | Places from its selected catalog dimensions only |
| Cabinet above | No | Added only after **Add Cabinet** is selected |
| Left / Right / Both end panels | No | Added only after that exact panel choice is selected |
| Smooth panel | No | Remains an explicit selection |

If selected optional parts cannot fit at a wall end or beside an existing cabinet, the system rejects **only the selected additions** and leaves the refrigerator and all existing cabinets in their original positions. It never moves an existing base or unrelated cabinet to make the refrigerator fit.

After an owner explicitly adds a cabinet above, end panels, or cap fillers, those source-priced parts are persisted with that refrigerator's unique configuration. Dragging, nudging, snapping, or moving that refrigerator in 3D moves only its selected cabinet-above / panels / cap fillers with it. Loose panels, manually added wall cabinets, and every other cabinet remain in place.

## Browser proof — local Designer

The browser placed `FRIDGE-36` at a tight wall end with the new default choices (**No Cabinet** + **None** panels). The refrigerator was accepted at its original `36 in` wall offset with:

- no end-panel-clearance blocker;
- no optional parts inserted;
- no movement of the refrigerator or any neighboring cabinet;
- no console errors.

![Standalone FRIDGE-36 at a wall end](/docs/proofs/refrigerator-independent-wall-end-local.png)

## Regression coverage

- `client/src/components/design/RefrigeratorOptionsDialog.test.tsx`
  - standalone refrigerator is the default submission;
  - cap and panels stay explicit opt-in choices;
  - selected panel/cap measurements still use real source SKUs.
- `client/src/lib/design.refrigeratorIndependent.test.ts`
  - movement, restore normalization, and wall-end behavior never reconstruct or move unselected parts.
- `client/src/lib/oneEngineRefrigeratorBayParity.test.ts`
  - explicit optional parts retain matching positions and pricing in a standard room and a 45° Wall Builder room.
- `client/src/lib/design.refrigeratorAssembly.test.ts`
  - source-part cap, filler, and panel transport follows only the configured refrigerator, never an unrelated cabinet.

## Validation

- TypeScript: passed
- Focused suite: **76 tests passed across 9 files**
- Production build: passed
- Diff integrity: passed

## Live verification — www.cabinetdealz.com

The live Designer served the updated `DesignTool-6tCOu0N_.js` chunk, including the standalone refrigerator default. A real browser interaction placed `FRIDGE-36` at the tight wall end, opened the options dialog with **No Cabinet** and **None** panels, and submitted **Add to plan**. Its position remained at the original `36 in` wall offset; no panels appeared, no clearance blocker appeared, and the browser recorded no console errors.

![Live standalone FRIDGE-36 at a wall end](/docs/proofs/refrigerator-independent-wall-end-live.png)

## Local interaction verification — configured refrigerator

A local Designer browser check verified the corrected interaction contract:

| Action | Result |
|---|---|
| Single click | Selects `FRIDGE-36`; **does not** open Refrigerator Options |
| Drag | Changes the refrigerator wall offset from **54 in** to **36 in**; **does not** open Refrigerator Options |
| Double click | Opens Refrigerator Options |
| Right click / Attributes | Opens Refrigerator Options in both the Floor Plan and 3D Designer |

![Double-click opens Refrigerator Options after drag](/docs/proofs/refrigerator-single-click-drag-local.png)

The same Playwright click / drag / double-click script then ran against **www.cabinetdealz.com**: single click and drag left the popup closed, the saved refrigerator changed from **54 in** to **36 in** along its wall run, and double-click opened Refrigerator Options. The site serves the dynamic `DesignTool-Dtm72XhF.js` module; dynamic module hashes are deployment-generated and need not match the local build filename.

## Local magnetic snap verification — selected end panel

Dragging a configured `FRIDGE-36` (with its explicitly selected left `REP2496` refrigerator end panel) into the magnetic capture range of a `B36` now resolves against the **panel**, not the refrigerator box:

| Measurement | Verified value |
|---|---:|
| B36 run end | 36 in |
| REP2496 left-panel start after snap | 36 in |
| Panel-to-B36 gap | 0 in |
| Refrigerator box wall offset after snap | 37.25 in |
| Refrigerator-to-panel clearance | 0.5 in |

The same shared envelope is used by Floor Plan dragging and 3D right-drag preview; both the standard room and a 45° Wall Builder run have unit coverage. No console errors occurred in the Floor Plan browser proof.

![Panel-aware refrigerator magnetic snap](/docs/proofs/refrigerator-magnetic-snap-local.png)
