# KitchenCrest 2020 design-source inventory

**Source:** user-provided `KCC_2020_Design_Files.zip`, received 2026-09-27. The archive identifies itself in `CatInfo.Xml` as **KitchenCrest Cabinets, LLC — Oct 2020**, catalog ID `KITCR_21`, Imperial units.

## Evidence types found

| Source location | Observed evidence | Intended extraction use | Constraint |
|---|---|---|---|
| `CatInfo.Xml` | Manufacturer, catalog description, Imperial UOMS | Catalog provenance | Provenance only; not a sellable-current catalog claim |
| `KITCR_21/DataPack/00_Settings.csv` | `GlobalUOMS=Imperial`, catalog identity | Unit-system confirmation | No product dimensions |
| `KITCR_21/DataPack/paf.xml` | Door styles/finishes, configuration variables, some validation expressions | Finish/style and generic configuration evidence | Not a complete product specification catalogue |
| `KITCR_21/kit1rec.dat` | Product family descriptions: base, wall, tall, drawer, toe-kick, hardware | Nomenclature vocabulary and family taxonomy | Proprietary binary; fields must be tied to decoded evidence before use |
| `KITCR_21/kit13rec.dat` | Record keys mapped to product codes such as `B24`, `B30`, `B2D24-2`, `W3030` | Code existence and code-family grouping | Does not alone establish dimensions/prices |
| `KITCR_21/kit14rec.dat` | Product labels/category strings and variable names for width/depth/frame elements | Nomenclature/family confirmation and configuration vocabulary | No assumed dimensions from category text |
| `KITCR_21/optkey2.dat` | Repeating `34.5` associated with base codes including `B12`, `B24`, `SB30`, `3DB24` | Candidate source evidence for standard base cabinet height | Requires parser-level validation before any production override |
| `CpsNew/` | CAD/design-shape support files | Source-available future geometry research | Not used as a product-photo or price source |

## Verified preliminary source observations

- The catalog includes standard base code families (`B12`, `B24`, `B30`, `B33`, `B36`, `B39`, `B42`, `B45`, `B48`), handed bases (`B12L`/`B12R` etc.), sink bases (`SB30`, `SB33`, `SB36`), drawer bases, roll-out variants, tall units, walls, microwave cabinets, toe-kick options, and fillers.
- `kit1rec.dat` explicitly names base and wall variants, tall 84/90/96-inch families, toe-kick choices, and hardware families.
- `paf.xml` provides source-backed door/finish option codes including `EB`, `ES`, `EW`, `LG`, `MW`, `SN`, and `SW`.
- The archive is historical (Oct 2020) and includes later file timestamps; it is a **source reference for documented KitchenCrest standards only**. It cannot overwrite current distributor availability, pricing, product photos, or line-specific dimensions without a matching current source.

## Adoption policy

1. **Universal structural vocabulary** may be derived where the source is explicit: cabinet family, code token, nominal width/height/depth fields, handedness, quantity/type of doors/drawers/roll-outs, and construction-rule vocabulary.
2. **Line-specific truth remains authoritative** for actual SKU availability, price, finish, product photo, depth, construction, and special geometry.
3. Any mismatch discovered between a current line and the 2020 KitchenCrest reference is an **audit item**, not an automatic update.
4. A production mapping must record source file/record evidence and a confidence classification before database or Designer changes.
