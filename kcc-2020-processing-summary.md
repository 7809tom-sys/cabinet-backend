# KitchenCrest 2020 catalog processing summary

**Source received:** `KCC_2020_Design_Files.zip`  
**Source identity:** KitchenCrest Cabinets, LLC, catalog `KITCR_21`, **October 2020**, Imperial units.

## Processing outcome

The archive has been processed into a source-traceable historical standards layer. It is **not a current sellable product catalog** and has **not** changed any live product availability, SKU identity, price, image, physical dimensions, cabinet geometry, or Designer rule.

A read-only distributor audit found **no current KitchenCrest source line** in the platform database. Therefore, there is no source-safe target for automatic cross-line updates. When a current KitchenCrest price/specification source is provided or imported, these historical annotations can be used for comparison and an audit queue—not as an overwrite.

## Core standards directly extracted

| Domain | Source-backed historical finding | Scope / guardrail |
|---|---|---|
| Units | Imperial | Catalog-wide setting only; it does not establish individual product dimensions. |
| Standard wall classes | Named 15, 18, 24, 30, 36, 42, 48, 54, and 60-inch **historical nominal-height** classes | Only codes in the explicit named class can carry that historical height annotation. Code digits do not prove width or depth. |
| Wall families | Standard wall, glass wall, spice-rack wall, inverted wall, wall custom, refrigerator wall, and separate microwave subclasses | Specialty families stay separate from the ordinary wall matrix. |
| Microwave vocabulary | `MW` = with shelf; `MWC` = without shelf; `MWD` = with drawer, where the exact code/label record supports it | No appliance-opening or overall dimensions inferred from the code. |
| Base vocabulary | Standard, sink, cut-corner sink, bottom-drawer sink, full-height-door sink, blind, diagonal, 135-degree, all-drawer, door/drawer, roll-out, and filler families | `B12`–`B48` is a documented **three-token code series**, not a published inch-width table. |
| Base depth/height | Limited full-door and angled-end records expressly name 12-inch depth; repeated 34.5 value is only a candidate | Neither result is a universal base depth or base-height rule. |
| Tall utility | Explicit 84, 90, and 96-inch-high × 24-inch-deep and separately × 12-inch-deep **utility** series | This is not a universal tall rule. |
| Tall/pantry classes | Pantry, carousel pantry, oven, oven/microwave, vanity-linen families explicitly recur at 84/90/96-inch historical heights | Per-family historical class only; no generated missing SKUs or code-digit dimensions. |
| Mirrors | Exact R/L pairs are recorded only where `AutoMirrorRelations.Txt` documents the pair | Never infer a mirror from an `R` or `L` suffix alone. |
| Configuration | Direct exact code/label mappings prove particular glass, roll-out, drawer, toe-kick, and filler vocabulary | No universal suffix grammar, toe-kick assignment, filler size, adjacency, or auto-placement rule. |

## Controlled adoption rule

> Match, then audit—never overwrite.

A future current-line mapping must retain the original source code and add: source file/record, catalog period, evidence status, parser version, and a current authoritative source for any physical or commercial field. A disparity becomes an audit item; it never changes a current line automatically.

## Source documents created

- [Historical source inventory](kcc-2020-source-inventory.md)
- [Standards master](kcc-2020-standard-master.md)
- [Base-family evidence](kcc-2020-analysis/base-analysis.md)
- [Wall-family evidence](kcc-2020-analysis/wall-analysis.md)
- [Tall-family evidence](kcc-2020-analysis/tall-analysis.md)
- [Configuration evidence](kcc-2020-analysis/configuration-analysis.md)
