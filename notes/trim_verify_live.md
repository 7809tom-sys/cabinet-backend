# Live verification: trim → cart fix

## Current design state (restored in-progress)
- Finish: **Casselberry White** (NOT Clark And Son) — Casselberry may have no TK-8 SKU
- One placed cabinet: BEC-24
- Build sheet shows: TOE KICK — 1 pc @ 8' · 2 ft run · **incl.** ($0)
- Estimated Total: $483.60
- Cart badge shows "1 items"

## Why still "incl."
Casselberry White is a different line than Clark And Son. The trim fix resolves TK-8/LRM-8/BAM
priced SKUs per styleId. If Casselberry has no TK-8 SKU, trim correctly stays quote-only ("incl.").
To PROVE the fix works, switch to a Clark And Son style that HAS TK-8 (e.g. WS/CS — confirmed 12/13 styles have TK-8).

## Change-style controls (indices seen)
- Right panel "DOOR STYLE SAMPLE / Casselberry" header ~ index 106/107/112 area
- Clicking 106/107/112 did NOT open a picker dropdown in the DOM list (no new options appeared).
- Need to find the actual "change door style" button. It may be the small pencil icon near
  "DOOR STYLE & PRICING". Try clicking the pencil/edit affordance or the sample thumbnail directly.

## Server + client fix summary (already implemented, TS clean, 9 vitests pass)
- server/routers/design.ts: `trimSkusForStyles` procedure (TK-8, LRM-8, BAM, SM-8, BF-3, BFF-3, WFF-3-42), tier-priced
- client/src/lib/trimCart.ts: `buildTrimCartLines`, `trimHasPrice`, TRIM_MASTER_CODES (crown=null)
- DesignTool.tsx: trimSkuRows query, trimPriceByCode map, activeTrims, trimCartLines memo,
  combined cartableLines (cabinetCartLines + trim), addAllToCart moved after cartableLines,
  build-sheet TRIM & EXTRAS now shows real price for TK-8/BAM/LRM-8 when priced
- server/trimCart.test.ts: 9 passing tests
