# Bug: Cart shows LIST price, not the customer's assigned tier price

## Root cause
`doorStyles.familyCatalog` (server/routers/catalog.ts, ~line 632) is what the
Family page (`/family/:styleCode`, client/src/pages/Family.tsx) uses to render
cabinet cards + add-to-cart. It returned the RAW distributor_skus price columns
(`contractorPrice`, `homeownerPrice`, etc.) straight from the DB, without:
  1. computing the tier SELL price via `sellPriceForTier(costRow, ps, tier)`,
  2. resolving the viewer's tier (`resolveStorefrontTier(ctx.user)`),
  3. gating columns (`visiblePricesForViewer`).

The raw columns are often null / pre-markup, so client `resolveTierPrice(tier, ...)`
fell back to `listPrice` (MSRP). That list price got stored as `CartItem.unitPrice`
at add time, so the Cart page (which correctly shows `item.unitPrice`) displayed
list instead of the customer's real price.

## Correct pattern (mirror of `stylesForCabinet`, catalog.ts ~1690-1740)
Sell prices are ALWAYS computed from the cost base × per-tier markup:
  const ps = await getPricingSettings();
  const costRow = { wholesalePrice, adjustedListPrice, listPrice };  // + yourCost where owner
  sellPriceForTier(costRow, ps, "homeowner"|"contractor"|"wholesale")
then `visiblePricesForViewer({...computed}, viewerTier, isAdmin)`.

Client add-to-cart already correctly calls `resolveTierPrice(tier, {computed cols})`
in both Family.tsx and CabinetDetail.tsx; Cart.tsx displays `item.unitPrice`.
CabinetDetail uses `stylesForCabinet` (already correct) — that's why the Cabinet
Detail page was fine but the Family page was not.

## Fix applied
Patched `familyCatalog` to compute + gate tier prices exactly like `stylesForCabinet`.

## Verification plan
- vitest for familyCatalog: homeowner viewer gets homeowner sell price (not raw list),
  wholesale/contractor columns nulled for homeowner viewer.
- tsc + full suite.
