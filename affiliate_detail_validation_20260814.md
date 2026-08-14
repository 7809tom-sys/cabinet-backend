# Affiliate Detail Validation — 2026-08-14

Focused owner-specific route and price-card regressions were rerun successfully: **4 test files, 9 assertions**.

| Validation | Evidence |
|---|---|
| Affiliate catalog card detail route | Preserves affiliate slug, selected style, and exact `cabinetId` for duplicate SKU records. |
| Dashed / merged detail identifiers | Duplicate-SKU and merged-alias route suites resolve the intended catalog record without a not-found result. |
| Owner private pricing | `affiliate-owner` markup contains **Affiliate Cost** and its adjusted-cost margin, and explicitly excludes **My Cost**. |
| Administration separation | Admin markup contains **My Cost** and explicitly excludes **Affiliate Cost**. |

The rerun used `affiliateCabinetDetailRoute`, `CabinetDetail.duplicateSkuRoute`, `CabinetDetail.mergedAlias`, and `CabinetDetail.priceCard` suites.

## Composed owner-flow contract

The route-to-private-price contract was strengthened with `CabinetDetail.affiliateOwnerFlow`: **3 focused test files, 8 assertions** pass. It composes the exact affiliate card URL (including `cabinetId`), the production owner-role resolver, and the rendered `PriceCard`; the resulting panel includes **Affiliate Cost**, **Sells At**, and **Margin**, while excluding **My Cost**. A second assertion retains the same owner role for a dashed SKU route.

## Custom-domain routing verification

The local production middleware was exercised with `Host: reaves-way-cabinet-shop.cabinetdealz.com` and the exact catalog-detail query. It returned **307** to `/store/reaves-way-cabinet-shop/catalog/W-12-30?style=330005&cabinetId=9360055`, preserving the complete route and query. The corresponding external custom-domain request was still serving the prior cached deployment at the time of this check, so the browser-level external verification remains explicitly pending rather than being marked complete.
