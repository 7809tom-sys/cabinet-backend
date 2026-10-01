# RHF Catalog Form Proof

**Date:** 2026-10-01 04:21 CT  
**Scope:** Correct the CabinetDealz Designer rendering for Ashford `RHF30` / `RHF36` without changing catalog data, pricing, or placement rules for other products.

## Authoritative catalog facts used

| Code | Description | Width | Height | Depth | Placement |
|---|---:|---:|---:|---:|---|
| RHF30 | Range Hood Front | 30 in | 23.5 in | 9 in | Wall |
| RHF36 | Range Hood Front | 36 in | 23.5 in | 12 in | Wall |

The catalog source depicts a **wood cabinet hood front**, with a shallow cabinet body, **two sloped wood doors**, and a **lower fascia**. It is not a stainless `HOOD-*` appliance and not a plain rectangular two-door wall cabinet.

## Shared corrections

- Added one `range-hood-front` catalog drawing type for `RHF##` codes and the “Range Hood Front” description.
- Kept RHF out of range/oven appliance classification, so it remains a wall cabinet and does not inherit appliance collision, countertop, or hood-mount behavior.
- Updated the shared catalog thumbnail, elevation, and Three.js mesh:
  - two doors slope back toward the wall;
  - a lower fascia and rail are present;
  - the selected door style/finish applies to the RHF face;
  - the generic rectangular wall-face frame and appliance hood canopy are suppressed.

## Validation

- `pnpm run check` — passed.
- Focused Vitest: `cabinetGraphics`, `ElevationView.mixedCabinetRules`, and `InteractiveRoom3D` — **444 passed, 2 intentionally skipped**.
- `pnpm run build` — passed.
- Local Designer browser proof — RHF30 persisted as `placement: wall`, `30 × 23.5 × 9 in`, no browser console errors.
- **Live verification — 05:04 CT:** `www.cabinetdealz.com` served `InteractiveRoom3D-CqhFiXuI.js` containing the unique RHF catalog-form marker. A live browser proof placed RHF30 as `placement: wall`, `30 × 23.5 × 9 in`, with no browser console errors and the corrected sloped double-door / lower-fascia elevation.

> The live elevation proof shows the corrected RHF30 sloped double-door front and lower fascia: `rhf30-catalog-form-live-elevation.png`.
