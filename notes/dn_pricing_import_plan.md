# DN Designer Natural — pricing import plan (verified facts)

## Confirmed with user
- 1st price column on Clark and Sons sheet = LIST PRICE.
- 2nd price column = OUR COST.
- Markup/tier prices are AUTOMATIC via the site's margin tab. Do NOT hardcode tier prices.
- User approved importing all DN priced SKUs ("yesimport", "import").

## How pricing works in this app (verified from code)
- Pricing lives in table `distributor_skus`. Columns:
  id, cabinetId, distributorId, styleId, platformSku, distributorSku,
  listPrice, yourCost, adjustedListPrice, wholesalePrice, contractorPrice,
  homeownerPrice, isAvailable, isPublished, createdAt, imageUrl, supplierCabinetName.
- Sell prices are computed at READ TIME by shared/margins.ts `sellPriceForTier`:
  sell(tier) = costBase × (tierMarkupBps/10000).
  Cost base precedence: yourCost → wholesalePrice → adjustedListPrice → listPrice.
- So to import DN correctly: store `listPrice` and `yourCost` ONLY. Leave
  wholesalePrice/contractorPrice/homeownerPrice NULL — they are derived automatically
  from yourCost via pricing_settings markups. This matches "markup automatic in margin tab".
- pricing_settings (id=1): globalMarkupBps=10000, homeownerMarkupBps=16500,
  contractorMarkupBps=12900, wholesaleMarkupBps=12500.
- Admin "Multiplier" tab: yourCost = listPrice × distributor costMultiplier. For DN we
  already HAVE explicit our-cost from the sheet, so store it directly as yourCost.

## Distributor / style facts
- Clark And Son = distributorId 2. DN currently has 0 rows in distributor_skus and no door_styles row.
- door_styles for distId2 uses ids in 30001-30062 range. Existing CS lines each have ~130-183 SKUs;
  RH has 62. Small "3-count" styleIds are Skyline-style placeholders, ignore.
- distributor_skus links to `cabinets` by cabinetId (cabinets.masterCode e.g. B-24, DB-30-2, W3630...).
- platformSku pattern for ASP example: `B12-ASP-CS` (masterCode-styleCode-CS). distributorSku: `ASP-B12`.
  For DN: distributorSku = `DN-<code>` (matches sheet), platformSku = `<masterCode>-DN-CS` pattern.

## DN new door_styles row to INSERT
- distributorId=2, styleCode=DN, ourName="Natura Maple", distributorName="Designer Natural",
  doorStyle=Shaker, woodSpecies=Maple/Birch natural, paintRef blank/null, doorSampleVerified=1, isActive=1.
- Need next free id (existing max around 30062 — verify, use e.g. 30063).

## DN swatch asset
- Reference crop: /home/ubuntu/cabinet-dealz/notes/refs/designer-natural-crop.jpg
- Target asset: /home/ubuntu/webdev-static-assets/door-designer-natural-v2.png (pale natural maple/birch shaker).

## DN SKU source data
- Full price list pasted by user: /home/ubuntu/upload/pasted_content.txt (DN-* rows: sku, desc, listPrice, ourCost, styleCode=DN, code).
- Also present in Clark and Sons CSV export: /home/ubuntu/upload/cs_tab.csv (gid 1544715108).
- Import matching: map each DN row's `code` (e.g. B24, DB30, 2DB24, W3630...) to cabinets.masterCode.
  Master codes may need normalization (sheet uses B24 / DB30, cabinets table uses B-24 / DB-30 style with dashes).
  MUST build a normalization map (strip/adjust dashes) and report any DN SKUs with no matching cabinet.

## Import approach
1. Insert DN door_styles row, get styleId.
2. Parse DN rows from cs_tab.csv (authoritative full set).
3. For each: find cabinet by normalized masterCode. Insert distributor_skus row with
   distributorId=2, styleId, cabinetId, distributorSku=DN-<code>, platformSku,
   listPrice, yourCost, isAvailable=1, isPublished=1. Leave tier prices NULL.
4. Report matched vs unmatched counts; unmatched SKUs listed for user.
5. Add a vitest to assert DN import + a sell-price resolves for a sample DN SKU.
