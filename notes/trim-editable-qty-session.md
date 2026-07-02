# Design Tool: editable trim piece counts (in progress)

## Goal
Let users override auto-calculated trim stick counts (crown, toeKick, batten, lightRail) with +/- steppers in the build sheet. Effective pieces drive BOTH display and cart price. Overrides persist in the saved draft.

## Key files / lines (DesignTool.tsx)
- State added ~L272-279: `trimQtyOverride` state + `TrimKind` type + `trimOverride` ref.
- Trim order memos ~L1272-1294: crownOrder/toeKickOrder/battenOrder/lightRailOrder = trimPiecesNeeded(...run...). Each has {pieces, stickFeet, orderedFeet, measuredFeet}.
- `effectiveTrimPieces` memo added ~L1296-1310: override ?? auto. 
- `activeTrims` ~L1312-1320: now uses effectiveTrimPieces (drives cart via buildTrimCartLines).
- Build-sheet render block ~L4900-5010: crown line (quote), toeKick/batten/lightRail (priced, show unit x qty), countertop (quote), trim subtotal, legend.
  - STILL TODO: replace `crownOrder.pieces` etc. in the DISPLAY + subtotal with effectiveTrimPieces, and add +/- stepper UI per trim line. Currently display still uses raw `*Order.pieces`.
- Draft persistence: writeDraft deps ~L2786 include crown/toeKick/batten/lightRail. Draft restore ~L2750-2754. NEED to add trimQtyOverride to draft save + restore.

## trimPiecesNeeded (client/src/lib/design.ts L1664)
- signature: trimPiecesNeeded(runInches, stickInches=96, waste=0.1) -> {pieces, stickFeet, orderedFeet, measuredFeet}
- pieces = max(1, ceil(runInches*1.1 / 96)) when run>0, else 0.

## Pricing codes
- toeKick=TK-8, batten=BAM, lightRail=LRM-8, crown=quote-only (no SKU). trimPriceByCode: Map<code,{unitPrice}>.

## Cost basis (confirmed by user)
- USCD cost = list * 0.30 ("pay 30 out of 100"). Bridge SKUs already inserted correctly. Done.

## Remaining plan
1. Build-sheet: use effectiveTrimPieces for pieces shown, ext price, subtotal.
2. Add stepper (-/N/+) per trim line; setTrimQtyOverride; show "auto"/reset when overridden.
3. Persist trimQtyOverride in draft (writeDraft + restore).
4. Reset overrides sensibly (e.g., when trim toggled off). 
5. Tests + typecheck + browser verify + checkpoint.
