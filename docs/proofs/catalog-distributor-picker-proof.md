# Catalog distributor picker proof

**Date:** 2026-10-01

## Requested behavior
A shopper can pick the cabinet distributor directly in the Designer **Catalog** drawer, before choosing a door style. This removes the detour through the Estimate / Door Style area and makes the cabinet line obvious on phone screens.

## Implemented behavior
- The shared Catalog drawer (desktop, compact workspace, and mobile) now shows a distributor selector immediately below catalog search, whether or not a door style has already been chosen.
- Options observed locally: **All distributors**, **Preston**, **Ashford**, and **Madison**.
- Choosing a distributor filters the door-style chooser and `design.placeableCabinets` query to that line. A new style pick keeps that distributor visibly selected.
- A placed kitchen retains its existing one-line order lock. Switching lines with placed cabinets preserves the existing confirmation path rather than silently mixing freight sources.
- On mobile, the Catalog prompt's **Choose a door style** button opens the Door Style & Color sheet directly.

## Browser proof
Authenticated 412×915 local Chrome run:
1. Opened mobile Catalog drawer before any door style.
2. Verified the catalog picker and distributor-first instruction.
3. Selected **Preston**; picker visibly read Preston.
4. Opened the mobile Door Style & Color sheet from the Catalog CTA.
5. No browser console errors.

Screenshots: `catalog-distributor-picker-mobile-selected.png` and `catalog-distributor-picker-mobile-style-sheet.png`.

## Validation
- TypeScript: passed.
- Catalog + toolbar regressions: 17/17 passed.
- Browser run: passed, no console errors.
- Production build and whitespace check: passed.
