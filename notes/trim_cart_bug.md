# Designer Trim → Cart bug (user report)

## Symptoms (from user)
1. In the Design Tool, hitting the **TK (toe kick)** button (and other trim: crown, light rail, batten, filler) puts trim in the design/build sheet but it does NOT appear in the shopping cart.
2. Trim color doesn't reflect the rest of the cabinets.

## Root cause (confirmed in code)
File: `client/src/pages/DesignTool.tsx`
- `cartableLines` (around line 1107-1153) builds cart items ONLY from:
  - placed cabinets (`p.cabinetId != null`, priced), and
  - `rolloutLines` (roll-out shelves).
- It NEVER converts the active trims (crown/toeKick/batten/lightRail) or fillers into cart line items.
- Trim quantities are computed as `crownOrder`, `toeKickOrder`, `battenOrder`, `lightRailOrder` (via `trimPiecesNeeded(...)`) around lines 1268-1286 — used for build-sheet display only.

## Trim SKUs DO exist as real per-style priced rows (distributorId=2 Clark And Son)
Confirmed via distributor_skus join (nb_trim3.mjs):
- **TK-8** (toe kick): priced per style (e.g. HS list 64.64 / cost 24.56). ~coverage varies.
- **LRM-8** (light rail): priced per style (ASP 150.56, CC 143.39, CS 160.60...).
- **BAM** (batten): priced per style.
- **SM-8** (scribe), **BF-3** (base filler): priced per style.
- **CM-8** crown: returned 0 Clark&Son SKUs — must pick the crown master code that actually has per-style SKUs (need to finish nb_trim4.mjs: rank crown/LR/toe/batten/filler codes by style coverage). Candidates for crown with coverage: CM-2 / CM-4 / BCM-8 / ACM-8 / COV / RCM-4S — verify which is priced.

Because each trim SKU is **per-style (styleId)**, resolving trim against the selected design styleId makes color inherit the cabinet finish automatically → fixes bug #2 at the same time.

## Fix plan
In `DesignTool.tsx`:
1. Add a `trimCartLines` memo that, for each ACTIVE trim with pieces>0, resolves the trim master code + current styleId (or per-cabinet effective style) to a priced SKU via the same `unitPriceFor`/SKU lookup used for cabinets, and emits a `CartItem` with qty = pieces.
   - Map: crown→(chosen crown code), toeKick→TK-8, lightRail→LRM-8, batten→BAM, filler(s)→BF-3 / SM-8 as appropriate (fillers are placed cabinets already via makeFiller? check: makeFiller creates a DesignCabinet — verify it has cabinetId so it may already be cartable; if not, include it).
2. Merge `trimCartLines` into `cartableLines` (append before returning the map array).
3. If a trim has no priced SKU for the chosen style, skip it (like unpriced cabinets) — do NOT block.
4. Add/extend vitest: a pure helper `trimCartLinesFor(...)` in shared or lib so it's unit-testable (inputs: active trims + orders + styleId + price lookup → CartItem[]). Assert toe kick appears with correct qty and styleId.

## Price lookup mechanism to reuse
- `unitPriceFor(p)` in DesignTool resolves a placed cabinet's unit price. Need the underlying SKU-by-masterCode+styleId+tier lookup. Find how unitPriceFor works (likely a map keyed by cabinetId or masterCode+styleId) and reuse it for trim master codes.

## Repro state
- /design shows an email gate ("Start Your Kitchen Design"). Must enter email + Launch Designer to reach the canvas. Preview: http://localhost:3000/design

## DB verify scripts (in server/, prefix nb_): nb_trim3.mjs, nb_trim4.mjs


## Live repro progress (browser)
- /design email gate: enter email + Launch Designer → designer canvas loads.
- Must pick a supply line then a door style before cabinets/pricing load. Style picker shows "Line A (19 styles)", "Line B (13 styles)", "Line C (32 styles)" — these are anonymized distributor names in preview. Clark And Son = the 13-style line (Line B).
- Toolbar trim buttons: Crown(33), Toe Kick(34), Batten(35), Light Rail(36), Filler(37). "Add to cart" button = index 157. Cart link top nav = index 9.
- Repro steps: pick Line B style → place a base cabinet on Back wall (auto-applies toe kick) → toggle Toe Kick on if needed → Add to cart → open /cart → confirm toe kick line is MISSING.
- Preview URL base: http://localhost:3000


## CONFIRMED LIVE (BEC-24, Casselberry White)
- Build sheet right panel shows "TRIM & EXTRAS" -> "TOE KICK: 1 pc @ 8' - 2 ft run" but labeled "incl." ($0).
- Estimated Total = $483.60 = cabinet only. Toe kick not priced, not a cart line item.
- So two coupled defects:
  1. Trim BOM lines are computed but priced at $0 ("incl.") -> never resolved to per-style SKU price.
  2. Trim lines are excluded from cartableLines -> never added to cart.
- Fix: resolve each trim BOM line to its per-style priced SKU (styleId-scoped => color/finish inherits automatically), give it a real unit price + qty, include it in cartableLines and in Estimated Total.
- Trim master codes to map: toe kick, crown, light rail, batten (BAM), filler/scribe. Need to confirm which exact master codes have Clark And Son SKUs (earlier CM-8 returned 0; TK/LRM/BAM had per-style SKUs).


## UI facts for repro (Line B / Casselberry White)
- After placing a cabinet, build sheet (right panel) has sections: "CABINETS" (BEC-24, $483.60) and "TRIM & EXTRAS" (TOE KICK "1 pc @ 8' - 2 ft run", shown "incl.").
- Toolbar trim toggles: Crown=33, Toe Kick=34, Batten=35, Light Rail=36, Filler=37. Add to cart button index ~141. Cart nav link index 9.
- Estimated Total reflects cabinets only; trim contributes $0.
- The toe kick auto-applied when the base cabinet was placed (matches tooltip "auto-applied to base runs").

## Next: code fix
- File: client/src/pages/DesignTool.tsx (cartableLines builder + BOM/"TRIM & EXTRAS" section).
- Shared helpers likely in shared/ (design/trim quantity calc). Need to re-open to find trim master codes + how unit price is resolved (unitPriceFor / SKU lookup by masterCode+styleId).
- Plan: resolve each active trim line to its per-style SKU price, set qty (pieces), add to cartableLines, include in total. styleId scoping = finish/color inheritance (fixes bug #2 too).
