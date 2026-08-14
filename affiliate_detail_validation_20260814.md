# Affiliate Detail Validation — 2026-08-14

Focused owner-specific route and price-card regressions were rerun successfully: **4 test files, 9 assertions**.

| Validation | Evidence |
|---|---|
| Affiliate catalog card detail route | Preserves affiliate slug, selected style, and exact `cabinetId` for duplicate SKU records. |
| Dashed / merged detail identifiers | Duplicate-SKU and merged-alias route suites resolve the intended catalog record without a not-found result. |
| Owner private pricing | `affiliate-owner` markup contains **Affiliate Cost** and its adjusted-cost margin, and explicitly excludes **My Cost**. |
| Administration separation | Admin markup contains **My Cost** and explicitly excludes **Affiliate Cost**. |

The rerun used `affiliateCabinetDetailRoute`, `CabinetDetail.duplicateSkuRoute`, `CabinetDetail.mergedAlias`, and `CabinetDetail.priceCard` suites.
