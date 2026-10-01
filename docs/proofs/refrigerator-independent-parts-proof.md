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

If a selected optional panel cannot fit at a wall end or beside an existing cabinet, the system rejects **only the selected additions** and leaves the refrigerator and all existing cabinets in their original positions. It never shifts a refrigerator, base, cabinet-above, filler, or panel to make a group fit.

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
  - movement, restore normalization, and wall-end behavior never reconstruct or move other parts.
- `client/src/lib/oneEngineRefrigeratorBayParity.test.ts`
  - explicit optional parts retain matching positions and pricing in a standard room and a 45° Wall Builder room.
- `client/src/lib/continuousWallPlacementParity.test.ts`
  - a move on a measured wall moves only the refrigerator.
- `client/src/lib/designCartLines.test.ts`
  - independently selected source parts remain invoiceable and source-priced without moving the appliance or base cabinet.

## Validation

- TypeScript: passed
- Focused suite: **76 tests passed across 9 files**
- Production build: passed
- Diff integrity: passed
