# Storefront Category Button Order Proof

**Date:** 2026-10-01 09:43 CT  
**Scope:** Reorder the locked storefront catalog category buttons requested for the Sales Demo storefront.

## Required sequence

1. Base
2. Wall
3. Corner
4. Tall
5. Filler
6. Panels
7. Wall Skins
8. Molding
9. Accessories
10. Vanity
11. View all

## Implementation

- The underlying catalog values remain unchanged, so each button continues to filter the matching source category.
- `Wall Skin / Scribe Veneer` is presented concisely as **Wall Skins**; `Accessory` as **Accessories**.
- Imported categories outside the listed sequence remain visible after the intentional set rather than disappearing.
- **View all** is deliberately rendered last.

## Local browser proof

A locked Sales Demo storefront session for Rustic Wood / Preston was checked at desktop width. The rendered DOM button order was exactly:

`Base → Wall → Corner → Tall → Filler → Panels → Wall Skins → Molding → Accessories → Vanity → View all`

No console errors were recorded.

## Automated validation

- TypeScript: passed.
- Storefront category order regression: 2/2 passed.
- Existing storefront unpriced-product safeguard: 1/1 passed.
- Production build and `git diff --check`: passed.
