# KitchenCrest 2020: configuration and nomenclature evidence

**Scope.** This report analyzes only the supplied historical KitchenCrest catalog, identified as **KitchenCrest Framed Cabinets, LLC — Oct 2020**, catalog `KITCR_21`, Imperial units. It is a reference for the documented 2020 vocabulary and code-to-description evidence. It is **not** authority to change a current line’s price, sellable status, finish availability, product image, construction, geometry, or dimensions. [1] [3]

## Conclusion

The record set supports a **controlled 2020 nomenclature dictionary**, rather than an unrestricted parser. Its strongest cross-family evidence is explicit code/description pairing: base, wall, tall, sink-base, vanity, specialty, and custom-unit vocabulary; `R`/`L` automatic mirror pairs; `-nRO` roll-out-tray variants; and several `-GL` glass variants. The catalog also defines a global `Door Style` feature with seven named option codes.

A normalizer may preserve those verified tokens and propose rules from the repeated pairs below. It must **not** synthesize a SKU, configuration, height, width, depth, finish applicability, or glass/roll-out availability from a pattern alone. In particular, the records show exceptions and abbreviated labels: a glass item can appear without a visible `-GL` suffix (for example, `W3030` is labeled “Wall w/Glass”), while some source text is a lossy transcription of proprietary records. [2]

## Evidence strength and source treatment

| Classification | Meaning in this report | Safe use |
|---|---|---|
| **Verified** | A supplied source explicitly names the code, option, relation, or configuration label. | Retain as 2020 historical evidence, with its cited scope. |
| **Candidate rule** | A repeated relationship suggests a mapping, but the catalog does not declare it as a universal grammar. | Use only as a review/normalization proposal; validate the target SKU against a direct source record. |
| **Prohibited assumption** | The source is silent, ambiguous, scoped only to 2020, or shows exceptions. | Do not populate or overwrite production data from it. |

`kit1rec.dat`, `kit13rec.dat`, and `kit14rec.dat` are proprietary binary sources. The searchable transcription was used only where its decoded strings agree with direct source-file evidence; source labels and examples are cited below. The inventory explicitly limits `kit13rec.dat` to code existence/grouping and forbids treating it alone as dimensional or price evidence. [1] [2] [3]

## Verified family and configuration vocabulary

The 2020 records explicitly use the high-level family terms **Base**, **Wall**, **Inverted Wall**, **Tall**, **Sink Base**, **Vanity**, **Peninsula**, **Diagonal**, **Blind Corner**, **Easy Reach Corner**, **angled end**, **end panel**, **filler**, **toe kick**, **appliance garage/tambour**, and appliance-related units. These are a source-backed structural vocabulary, not a promise that every current line contains each family. Examples include `IW24R` (“Inverted Wall” / `FHD` / “Door”), `SBBD24` (“Sink Base Bottom Drawer”), `BAE33R` (“Base Angled End w/Door”), and the mirror-listed `WBC2730R` / `WBC2730L` (“Wall Blind Corner”). **Sources:** `KITCR_21/kit1rec.dat`, `KITCR_21/kit14rec.dat`, and `KITCR_21/AutoMirrorRelations.Txt`; examples `IW24R`, `SBBD24`, `BAE33R`, `WBC2730R/L`. [2] [3]

The records also explicitly define configuration terms in the custom-unit setup vocabulary: `0=Empty`; `3001=Base Door`; `3008=Base Door/False Dwr`; `3009=Base Door/Drawer`; `3004=Base Glass Door`; `3002=Wall Door`; `3005=Wall Glass Door`; `3003=Tall Door`; `7=Tilt-Out Door`; `12` through `16` for 1 through 5 drawers; `24=Tambour`; `51=Micro-Wave`; `52=Single Oven`; `53=Double Oven`; and `3054=Opening`. It also names section-level `style` and `height` variables for custom base, tall, and wall configurations. **Source:** `KITCR_21/kit14rec.dat`; searchable-record examples around “Base Custom” / `BCT#W#H#D@I`, “84\"H Tall Custom” / `TCT#W#H#D@I`, and “Wall Custom” / `WCT#W#H#D@I`. [2] [3]

This is vocabulary evidence only. It does **not** establish that all listed configuration states apply to all products, or that a configured custom unit is a valid current SKU.

## Verified suffix and token meanings

| Token or pattern | Explicit 2020 evidence | Verified conclusion | Limit |
|---|---|---|---|
| `R` / `L` | `AutoMirrorRelations.Txt` directly pairs `B12R` with `B12L` and `B15R` with `B15L`, each “Base - 1 Door/1 Drawer”; it also pairs `U188424R/L` (“Tall Utility 2 Doors”), `W1842GDR/GDL` (“Wall 1 Glass Door”), and numerous corner/end products. | In the listed pairs, `R` and `L` identify automatic mirror counterparts. | The relation file, not spelling alone, is the proof. Do not assume every code ending in `R` or `L` is a valid mirror or that its exact geometry is known. |
| `-1RO`, `-2RO`, `-4RO` | `B15R-1RO` is “Base w/1 Roll-Out Tray”; `B15R-2RO` is “Base w/2 Roll-Out Trays”; `B39-4RO` is “Base w/4 Roll-Out Trays.” Additional direct examples include `B27-1RO`, `B30-2RO`, `B42-4RO`, and `B48-4RO`. | For these explicitly labeled base variants, `RO` denotes roll-out tray(s), and the preceding number matches the stated tray count. | This is proven for the named variants, not for every family or any unlisted `-nRO` code. The tall `CC2496` is described with roll-out content but has no `-nRO` suffix, so roll-outs are not encoded only one way. |
| `-GL` | `TD2184R-GL` is “Tall Drawer w/Glass”; `TD3384-2-GL` is also “Tall Drawer w/Glass”; `BAE24R-GL` is “Base Angled End GL” / “w/Glass”; and `BRC-R-GL` is a “Base Radius Cap” / “w/Glass.” | In these directly labeled examples, `-GL` marks the glass variant. | It is not a complete glass grammar. `W3030` is labeled “Wall w/Glass” in the record transcription without a visible `-GL`; direct code lookup remains required. |
| `B2D…-2` and `B4D…-4` | `B2D24-2` is “Base Door 2 Drawer”; `B2D12R-2` has the same label; `B4D30-4` is “Base Door 4 Drawer”; examples continue through `B4D48-4`. | These exact codes verify the described base-door / two- or four-drawer configurations. | The record does not supply a universal formal expansion for every internal character. Do not infer door count, drawer layout, or dimensional proportions from `2D`, `4D`, or the terminal numeral alone. |
| `SBBD` | `SBBD24` is “Sink Base Bottom Drawer”; `SBBD24R` and `SBBD24L` are separately listed. | The cited codes establish a sink-base bottom-drawer family and some handed variants. | Do not expand this abbreviation to other code families without a direct listing. |
| `FHD` | `SBFD24R` is labeled “Sink Base FHD,” while nearby records use “Base Full Door Standard” and `IW24R` is labeled “Inverted Wall / FHD / Door.” | `FHD` is a source-backed configuration token used in base, sink-base, and inverted-wall descriptions. | The supplied records do **not** explicitly expand `FHD`; treating it as a particular door construction, count, or height is prohibited. |
| `-VB` / `-IRON` | `B15R-VB` is “Base w/Vegetable Basket”; `B18R-IRON` is “Base w/Ironing Board.” | These two exact suffixes identify the cited accessory variants. | No broad rule is established beyond the explicitly listed codes. |

**Sources for this table:** `KITCR_21/kit1rec.dat` and `KITCR_21/kit14rec.dat`; searchable-record examples `B15R-1RO`, `B39-4RO`, `B2D24-2`, `B4D30-4`, `SBBD24`, `TD2184R-GL`, `TD3384-2-GL`, `BAE24R-GL`, `BRC-R-GL`, `SBFD24R`, `IW24R`, `B15R-VB`, and `B18R-IRON`. Mirror claims additionally use `KITCR_21/AutoMirrorRelations.Txt`. [2] [3]

## Candidate normalization rules — not verified as universal grammar

1. **Represent product identity as an opaque source code plus parsed annotations.** A reviewable candidate parser can recognize a family prefix, a numeric-looking core, an optional hand marker, and hyphenated modifiers. Preserve the unmodified source code as the key and record the parser version and confidence. The repeated forms `B15R-1RO`, `B2D24-2`, and `TD2184R-GL` make this useful, but they do not prove every position has one fixed meaning.

2. **Normalize roll-out evidence only on direct matches.** Candidate mapping: `-([124])RO` → `roll_out_tray_count` when a matching historical code/description exists. A code matching the regular expression but absent from direct evidence should be flagged, not populated. `CC2496` is the boundary case: it supports a roll-out attribute only through its own description, not by the base-family suffix rule.

3. **Normalize glass as a variant attribute, not as a required suffix.** Candidate mapping: direct `-GL` code/description pairs → `has_glass=true`. Also permit an explicit “w/Glass” description to support the same attribute while retaining its exact code. Do not reject or rewrite a glass record that lacks `-GL`, and do not add `-GL` to a code merely because another family uses it.

4. **Normalize handedness only when the mirror relation or direct paired records support it.** Candidate mapping: `R`/`L` in `AutoMirrorRelations.Txt` → `hand=right/left` plus the cited counterpart. Absence from that file is “unverified,” not “unhanded.”

5. **Treat the custom templates as field-schema candidates, not dimension evidence.** `BCT#W#H#D@I`, `TCT#W#H#D@I`, and `WCT#W#H#D@I` visibly contain `W`, `H`, and `D` tokens. Candidate use: capture them as width/height/depth placeholders pending parser-level validation. They do not state an allowed range, nominal value, unit conversion rule, or the dimensions of any non-custom SKU.

## Finish and feature evidence

`KITCR_21/DataPack/paf.xml` explicitly declares feature `8810000`, **Door Style**, and its seven options. `04_Products_Global.csv` calls `Global.GSV` “Global configuration,” while `39_ProductsXFeatures_Global.csv` attaches feature `8810000` to that global configuration. The catalog-level option mapping is therefore verified, but per-product applicability is not. [3]

| Option code | Source display name | What is verified |
|---|---|---|
| `EB` | Estate Black | A named `Door Style` option in the 2020 global configuration. |
| `ES` | Estate Sage | Same. |
| `EW` | Estate White | Same. |
| `LG` | Light Grey | Same. |
| `MW` | Modern Wood | Same. |
| `SN` | Shaker Navy | Same. |
| `SW` | Shaker White | Same. |

Each option has 2020 medium and large multimedia paths in `paf.xml` (for example, `Multimedia\Pictures\Medium\EB.jpg`). That proves an archive asset association only. It does **not** authorize using the old asset as a current product image or claim that a named option remains currently offered. **Sources:** `KITCR_21/DataPack/paf.xml`, `KITCR_21/DataPack/04_Products_Global.csv`, `KITCR_21/DataPack/39_ProductsXFeatures_Global.csv`. [3]

## Universal-versus-line-specific boundary

**May be carried forward only as a historical, generic vocabulary.** The explicit 2020 family names; direct code/description pairs; documented mirror relations; documented configuration labels; and the seven `Door Style` option labels are suitable for source attribution, search synonyms, and audit suggestions. They are universal only **within the documented 2020 KitchenCrest catalog**, not across manufacturers or current KitchenCrest lines.

**Must remain line- and SKU-specific.** Sellability/availability; price; finish availability; current images; material, construction, and hardware details; special geometry; handedness when no mirror relation exists; product depth; and every actual width or height must be sourced to the exact target line/SKU. The inventory specifically says historical KitchenCrest evidence cannot overwrite current availability, pricing, product photos, or line-specific dimensions, and that apparent mismatches are audit items rather than automatic updates. [1]

## Prohibited assumptions and implementation guardrails

- Do **not** derive a dimension from digits in a code. For example, `TD2184R-GL` is direct evidence for a tall-drawer glass configuration, not independent proof that `21`, `84`, or any embedded number represents a particular width, height, or depth. The explicitly labeled `84"H`, `90"H`, and `96"H` **custom** tall templates remain limited to those exact template labels.
- Do **not** expand `FHD` beyond the literal source token. Do not infer “full-height,” a door count, a drawer count, or construction from it.
- Do **not** infer that `-GL` is necessary for glass, that all `R/L` codes are mirrored, or that all roll-outs use `-nRO`.
- Do **not** infer all option codes are available for every product. The source establishes a global 2020 `Door Style` menu, not SKU-level availability or a current finish program.
- Do **not** use archive images, price records, or historical source timestamps as current commercial evidence.
- Do **not** create a new code by combining otherwise observed tokens. Each candidate normalization must resolve to a direct source record before becoming a historical SKU mapping; each production mapping additionally needs a current target-line source.

## References

[1]: file:///home/ubuntu/cabinet-dealz/kcc-2020-source-inventory.md "KitchenCrest 2020 design-source inventory"
[2]: file:///home/ubuntu/kcc-2020-source/kcc-2020-searchable-records.txt "KitchenCrest 2020 searchable records transcription"
[3]: file:///home/ubuntu/upload/KCC_2020_Design_Files.zip "KitchenCrest 2020 Design Files original archive"
