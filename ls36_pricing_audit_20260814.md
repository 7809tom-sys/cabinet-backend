# LS36 Pricing Audit — 2026-08-14

The active mobile finish label **Aura Cream (Ashford)** resolves to style `330002` (Classic Cream source record with the Aura Cream affiliate-facing alias).

| Cabinet | Catalog SKU | List price | My Cost | Adjusted list price |
|---|---:|---:|---:|---:|
| LS3312 | CC-LS3312 | $778.81 | $295.95 | $986.49 |
| LS3612 / LS36 | CC-LS3612 | $788.80 | $299.74 | $999.15 |

The live mobile two-item preview is an unsaved layout, so it has no persisted `kitchen_designs` row from which to identify an LS36 placement or infer which catalog amount the user expects. The itemized preview is calculated from the active cabinet-and-style pair using the shared tier-pricing resolver. No source sheet or prior LS36 price-change audit record is available in the workspace. No price value has been altered pending the authoritative expected amount.

## Live two-item total reconciliation

The reported **$801.12** subtotal was matched exactly to the active Aura Cream (`styleId=330002`) cost-based homeowner price path:

| Item | Cabinet ID | My Cost | Homeowner price |
|---|---:|---:|---:|
| LS3612 / LS36 | 9390049 | $299.74 | $494.57 |
| WDC2430 | 9390172 | $185.79 | $306.55 |
| **Total** | — | — | **$801.12** |

The active homeowner tier multiplier is 16,500 basis points (1.65×). The source list-price total for the same pair is $1,277.72, so the displayed $801.12 is not a duplicate-SKU or stale-style amount; it is the cost-based homeowner-tier calculation. An authoritative target amount remains necessary before changing either source row.
