# KitchenCrest 2020 Cabinet Standard Master

## Practical conclusion

**Use this master as a historical KitchenCrest 2020 reference and a controlled structural-template layer—not as a current product catalog or a dimensional override.** The supplied archive identifies catalog `KITCR_21` as KitchenCrest, October 2020, in Imperial UOMS. Its proprietary-record extract documents cabinet families, named height/depth classes in limited contexts, exact code/label pairs, and selected mirror/configuration relationships. It does **not** provide a universally decoded SKU-dimension schema. [1][2]

Accordingly:

- **Safe universal structural template (within this implementation):** retain exact historical codes and labels; use the documented family vocabulary; record directly named historical wall/tall classes; retain exact documented configuration and mirror relations; and preserve source provenance and confidence for every mapping.
- **Must remain distributor/line/SKU-specific:** current sellability, SKU set, price, availability, finish applicability, product imagery, material/construction, physical width/height/depth, appliance openings, footprint, special/corner geometry, and compatibility/placement rules. A historical mismatch is an **audit item**, never an automatic correction. [1]
- **Do not decode dimensions from code digits.** `B24`, `SB30`, `DB24`, `BA135-18R`, `W2412`, `O338424`, and similar strings are identifiers/tokens unless a source explicitly associates the individual record or an explicitly named class with a dimension. Raw `B3524`/`BB3524`/`BC3524` strings remain opaque; repeated `34.5` in `optkey2.dat` remains a candidate pending parser-level validation. [3]

> **Implementation rule:** Store the original KitchenCrest source code verbatim as the historical identifier. Attach evidence-backed annotations with a status of **verified**, **candidate**, or **unverified**; never turn a candidate annotation into geometry or current-line truth without a matching authoritative target-line source.

## Evidence model and scope

| Evidence status | Meaning in this master | Permitted use |
|---|---|---|
| **Verified—historical** | Explicit source label, code/description match, named dimension class, or exact mirror relation in the supplied 2020 evidence. | Historical reference, taxonomy, search/audit synonym, and carefully scoped normalization. |
| **Candidate** | A repeated code/template pattern suggests a field relationship but the source does not fully decode the field positions. | Review aid only; retain separately from dimensional and current-line data. |
| **Unverified / prohibited** | The supplied evidence is silent, ambiguous, or only shows a raw binary string. | Leave null/opaque; do not infer or generate. |

The searchable records are printable runs from proprietary Raima/20-20 binary catalog records. Adjacent strings are not automatically a field/value relationship, so code appearance and raw-record adjacency alone are not dimensional proof. [2, lines 1–4][1]

## Compact historical dimensional standard table

All values below are **historical source-labeled classes only**. A listed class does not establish a universal SKU matrix, construction, physical geometry, or availability in any current line.

| Cabinet domain | Directly evidenced historical dimension/class | Scope and examples | Safe template use | Not established / blocked |
|---|---|---|---|---|
| Catalog-wide unit system | **Imperial** | `GlobalUOMS=Imperial` in the catalog settings. [1] | Store source UOMS as archive metadata. | No product H/W/D follows from the UOMS declaration. |
| Standard wall | **15, 18, 24, 30, 36, 42, 48, 54, 60 in. nominal-height classes** | The records explicitly label these as Wall, Wall w/Door, and/or Wall w/Glass classes; e.g., `15"H Wall w/Door` with `W2415`, and `15"H Wall w/Glass` with `W2415-GL`. [4][2, lines 72950–73035] | Record `historical_nominal_height_in` only for codes demonstrably in the named class. | Code digits do not prove width or depth. `W2412` does **not** establish a standard 12-in. wall class or a 24 × 12 cabinet. [4] |
| Ordinary base | No universal ordinary-base H/W/D is decoded. | `B12` through `B48` are an observed +3 **numeric-token** ladder, not an inch-width table. [3] | Store the number as `code_width_token`; preserve family and source label. | No common base width, height, depth, footprint, opening, or placement rule. |
| Full-door base / angled-end records | **12 in. depth is explicitly named, but only in limited records** | A full-door-base row states `12"D`; an angled-end label also names `12"D w/Door`. [3] | Retain this narrowly scoped historical depth evidence with its record reference. | Do not apply 12-in. depth to all `-12` codes or all base families. |
| Utility tall | **84, 90, 96 in. high × 24 in. deep** and separately **84, 90, 96 in. high × 12 in. deep** | Direct labels include `84"H 24"D Utility`, `84"H 12"D Utility`, and corresponding 90/96 blocks; examples include `U1284R/L` and `U128412R/L`. [5][2, lines 66638–66838] | Reuse as documented historical utility class metadata. | Not a universal tall standard; do not decode unrelated `U` strings or target-line SKUs by pattern. |
| Pantry / carousel pantry | **84, 90, 96 in. high** | Direct labels and examples: `P1884R/L` through `P1896R/L`; `LSP2484R/L` through `LSP2496R/L`. [5][2, lines 67443–67612] | Record the stated historical height class. | Pantry/Carousel depth and all numeric positions are not fully decoded from the code. |
| Oven-oriented tall | **84, 90, 96 in. high** for Single Oven, Double Oven, Oven/Microwave, Single Oven/Drawer, and Double Oven w/tambour | Examples include `SO2484`, `DO2484`, `OMW2484`, with corresponding 90/96 blocks. [5] | Retain named historical family and height tier. | Do not map `O338424`, `O339024`, or `O339624` to a per-code dimension merely from adjacency to “Tall Oven- Microwave Combo.” [5] |
| Vanity-linen tall | **84, 90, 96 in. high** | Vanity Linen, Vanity Linen Hamper, and Vanity Linen w/Drawers are explicitly labelled at those heights. [5] | Record historical family and height tier. | `D/G`, `R/L`, and numeric token semantics are not globally decoded. |
| Base-height candidate | **34.5** is a candidate only | Repeating `optkey2.dat` values occur near base codes, but the inventory requires parser-level validation. [1][3] | Preserve in a review table as `candidate_base_parameter=34.5`, with source. | Never use as standard base height, elevation, geometry, pricing input, or override. |

### Historic code-token ladders (not dimensional ladders)

- The ordinary `B` series directly includes `B12`, `B15`, `B18`, `B21`, `B24`, `B27`, `B30`, `B33`, `B36`, `B39`, `B42`, `B45`, and `B48`: a verified **+3 numeric-token progression**. [3]
- Standard-wall records at the 30- and 36-high named groups visibly include leading numeric tokens from `09` through `48` in three-unit steps; other named height groups have smaller observed subsets. This is an observed code pattern, **not** a universal availability or physical-width standard. [4]
- Tall templates visibly contain `#W`, `#H`, and `#D` placeholders (for example, `U#W#H#D@I`, `P#W#H#D@…`, and `LSP#W#H#D@I`). They demonstrate formal template variables, not a complete parser for every concrete SKU. [5][2, lines 66645–66648; 67448–67451; 67547–67550]

## Nomenclature grammar: controlled annotations, not a generative SKU parser

### 1. Core preservation rule

Treat every source code as an **opaque historical key**. A normalizer may add annotations only where an exact source record supports them. The following is a storage approach—not a claim that every code conforms to one grammar:

```text
source_code (verbatim)
  + family (source-labelled)
  + source_label / variant_text (source-labelled)
  + observed tokens (nullable, non-dimensional by default)
  + direct configuration attributes (only where code-description matched)
  + mirror counterpart (only where exact relation is documented)
  + evidence source, record/line, status, parser version
```

Suggested reference fields are: `catalog_id`, `source_period`, `source_file`, `source_record_or_line`, `source_code`, `source_label`, `family`, `variant_text`, `code_width_token`, `code_height_token`, `historical_nominal_height_in`, `historical_depth_in`, `dimension_status`, `mirror_code`, `configuration_attributes`, `evidence_status`, and `parser_version`. Keep target-line fields—especially `current_sku`, price, availability, image, dimensions, construction, finish, and geometry—in a separately sourced layer. [1][3]

### 2. Source-backed family vocabulary

| Family group | Directly evidenced historical vocabulary / examples | Safe normalization boundary |
|---|---|---|
| Base | Standard base; roll-out; door-plus-2/4-drawer; all-drawer 2/3/4/5; full door; open shelf; curved/end/angled; blind; diagonal corner; 135°; desk drawer. Examples include `B24`, `B2D24-2`, `B4D30-4`, `2DB12`, `DB12`, `BOS24`, `BAE33R`, `BB36L/R`, `BCD33`, and `BA135-18R/L`. [3] | Family/category and exact code-label evidence only; no physical geometry from the tokens. |
| Sink / base corner | Sink Base `SB`; cut-corner sink `SBC`; Sink Base Bottom Drawer `SBBD`; FHD-labelled `SBFD`/`SBCFD`; Diagonal Sink Base `DSB`; Base Corner Diagonal; blind and peninsula blind variants. [3] | Retain exact family labels and records; do not infer opening, corner footprint, hand convention, or compatible neighbor. |
| Wall / specialty wall | Standard Wall `W`; Wall w/Glass; Wall w/Spice Rack; Inverted Wall `IW`; Wall Custom `WCT`; Refrigerator Wall `RW`; microwave classes `MW`, `MWC`, and `MWD`. [4] | Keep specialty families separate from the standard-W matrix unless a product-specific source proves a relation. |
| Tall / panel / vanity | Utility `U`; Pantry `P`; Carousel Pantry `LSP`; oven families (`SO`, `DO`, `OMW`, `SOD`, `DOT`); Refrigerator End Panel `REPV`; Vanity Linen / Hamper / w/Drawers (`VL`, `VLH`, `VLD` records). [5] | `REPV` is an end-panel family, not evidence for a refrigerator cabinet. Do not globally parse code numerals or hand markers. |
| Filler, toe-kick, appliance/specialty | Base Corner Filler (`CCT48`, `BCF3`); Corner Filler Wizard (`CF3`); Wizard Base Unit Angle-filler (`WIZ-OKHKP`); “Base Fillers”; toe-kick options; tambour/appliance vocabulary. [3][6] | These support historical vocabulary/search and optional configuration records—not a universal size, adjacency, or placement/compatibility rule. |

### 3. Observed token handling

| Token / pattern | What is directly documented | Safe action | Prohibited expansion |
|---|---|---|---|
| Standard `B` numerical core | The observed ordinary-base progression is `12`–`48` in +3 tokens. [3] | Store as a code token, e.g. `code_width_token="24"`. | Do not populate `nominal_width_in` from `B24` or infer absent series members. |
| Standard `W` form | `W#W#H#D@I` is a historical template; named wall-height groups support a **historical nominal-height** association for codes within the explicit group. [4][2, lines 72950–73035] | For a record proven in a named group, record the final two-digit height token/class with its evidence. Keep the first numeric pair as `width_token` only. | Do not turn `W2412` into 24 × 12, establish a 12-in. standard-wall class, or infer depth from a placeholder. |
| Tall templates | `U#W#H#D@I`, `P#W#H#D@…`, `LSP#W#H#D@I` are visible templates. [5] | Preserve candidate token annotations and parser confidence. | Do not treat all concrete tall codes as fully decoded. |
| `B3524`, `BB3524`, `BC3524` | Recurring raw construction/configuration strings near multiple base-related records. [3] | Preserve verbatim in `opaque_historical_token`. | Do not parse as 35 × 24, 34.5 × 24, or any H/W/D value. |
| `R` / `L` | Exact pairs in `AutoMirrorRelations.Txt` include `B12R/L`, `B15R/L`, `U189024R/L`, `U189624R/L`, `REPV2496R/L`, `REPV2796R/L`, `REPV30120R/L`, and documented wall/corner examples. [5][6] | Set `mirror_code` and an evidence-backed hand annotation only for the listed/directly paired relation. | Do not conclude every `R`/`L` code is mirrored, orient it geometrically, or create a missing counterpart. |
| `FHD` | Literal configuration token in records such as `SBFD24R` and `IW24R`. [3][6] | Preserve `FHD` verbatim. | Do not expand it to full-height, door count, construction, or geometry. |

## Documented configuration rules

These are the **only** configuration mappings that can be carried as historical normalized attributes without further decoding. Each remains scoped to its direct record evidence.

| Configuration | Direct evidence | Historical rule that may be recorded | Boundary / exception |
|---|---|---|---|
| Roll-out trays | `B15R-1RO` = Base w/1 Roll-Out Tray; `B15R-2RO` = Base w/2 Roll-Out Trays; `B39-4RO` = Base w/4 Roll-Out Trays. `B24-1RO/-2RO` is similarly labelled. [6][2, lines 243–300] | For an **exact code-description match**, record `roll_out_tray_count` as 1, 2, or 4. Utility `U…-RO` examples are directly called Utility w/4 RO. [5] | Do not infer `-nRO` for an unlisted code/family. Roll-outs can be described without that suffix. |
| Glass | Direct `-GL` examples include `TD2184R-GL`, `TD3384-2-GL`, `BAE24R-GL`, `BRC-R-GL`, and wall examples such as `W2415-GL`. [6][2, lines 73010–73035] | Record `has_glass=true` for direct code/description matches or an explicit “w/Glass” label. | `W3030` is a documented glass exception without visible `-GL`; do not require, add, or remove the suffix as a universal rule. [6] |
| Base door/drawer variants | `B2D24-2` and `B2D12R-2` are “Base Door 2 Drawer”; `B4D30-4` is “Base Door 4 Drawer.” All-drawer base labels directly name 2/3/4/5-drawer families. [3][6] | Store the description-derived configuration on the exact historical item. | Do not derive a door/drawer layout, proportions, or construction from unlisted `2D`, `4D`, or terminal-number patterns. |
| Sink-bottom-drawer | `SBBD24` is “Sink Base Bottom Drawer”; associated handed records are present. [3][6] | Record historical family/configuration label for direct records. | Do not generalize `SBBD` outside direct evidence or infer geometry. |
| Vegetable basket / ironing board | `B15R-VB` is “Base w/Vegetable Basket”; `B18R-IRON` is “Base w/Ironing Board.” [6] | Store those exact accessory attributes. | No broad suffix grammar or cross-family availability. |
| Microwave subclass | `MW` is named with shelf; `MWC` without shelf; `MWD` with drawer. [4] | Store the direct historical microwave subclass and exact code. | Do not infer overall/appliance-opening H/W/D or current applicability. |
| Custom-unit vocabulary | The source names Base Door, Base Door/False Dwr, Base Door/Drawer, Base/Wall Glass Door, Tall Door, Tilt-Out Door, 1–5 drawers, Tambour, Micro-Wave, Single/Double Oven, Opening, and section `style`/`height` fields. [6] | Use as controlled historical configuration vocabulary. | It does not prove all states apply to all products or validate a current custom SKU. |
| Toe kick | The records contain `placemolding;autotoekick;assigntoekick` and labels/tokens No Toe Kick/`NO.TOE`, Flush Toe Kick/`FL.TOE`, 9"H Toe Kick/`9H.TOE`, Add Back Toe Kick/`BACK.TOE`. [3][2, lines 100968–100978] | Model as historical **optional configuration vocabulary**. | Do not infer universal height/recess, included quantity, auto-placement, assignment, or SKU bundling. |
| Fillers | Direct names include Base Corner Filler, Corner Filler Wizard, Wizard Base Unit Angle-filler, and Base Fillers. [3] | Model historical filler category/variant labels. | Do not infer filler size, placement offset, adjacency, or compatibility. |
| Door Style options | Global 2020 options: `EB` Estate Black, `ES` Estate Sage, `EW` Estate White, `LG` Light Grey, `MW` Modern Wood, `SN` Shaker Navy, `SW` Shaker White. [6] | Retain as historical global feature vocabulary, with source. | No SKU-level or current finish availability; archived media paths are not current product-photo authority. |

## Universal structural template vs. distributor/line-specific truth

| Topic | May be standardized in the cross-line template | Must remain distributor/line/SKU-specific |
|---|---|---|
| Identity and provenance | Historical catalog (`KITCR_21`), source period (Oct 2020), source code, label, source file/record, evidence status, parser version. | Current distributor SKU, product URL/source, current line/catalog identity. |
| Taxonomy | The documented 2020 family vocabulary and exact configuration labels. | Whether the target line offers that family/configuration at all. |
| Codes and tokenization | Verbatim code; opaque numeric/alphanumeric tokens; direct exact code-label mappings; exact documented mirror relations. | Generated codes, assumed counterparts, inferred decoding, target-system SKU substitutions. |
| Dimensions | Historical named class fields from the compact table, explicitly labelled as historical and evidence-scoped. | Any current physical/nominal H/W/D, footprint, opening, clearance, elevation, and special geometry; target source is required even if a historical class agrees. |
| Designer behavior | Optional vocabulary fields for toe kick, fillers, custom configuration, roll-outs, and mirrors. | Auto-placement, collision/adjacency logic, toe-kick assignment, filler placement, compatibility, mirroring orientation, and appliance-opening behavior. |
| Commercial/content data | None from this archive. | Price, promotions, availability, sellability, finish availability, product images, construction, warranty, and marketing copy. |

## Safe cross-line adoption plan

1. **Ingest as a read-only historical reference.** Create a KitchenCrest-2020 source layer; do not merge its values directly into current products. Preserve the original code, label, source pointer, catalog ID, and evidence status. [1]
2. **Normalize only direct evidence.** Map source-labelled families and the exact configuration rules in this master. Keep ambiguous code segments in token/opaque fields rather than physical-dimension fields. No SKU is created by combining observed prefixes, digits, suffixes, or hand markers. [3][4][5][6]
3. **Keep two dimensional channels.** (a) `historical_named_class` stores only the scoped values in the compact table; (b) `current_geometry` accepts only a current authoritative product source. Historical code tokens and raw `B3524`-style strings never feed `current_geometry`. [1][3]
4. **Apply a mirror gate.** Create a mirror relation only when the exact source pair is documented in `AutoMirrorRelations.Txt` or equivalently direct paired evidence. For every other `R`/`L` appearance, use `mirror_status=unverified`. Do not infer orientation conventions. [5][6]
5. **Apply a configuration gate.** Set glass, roll-out count, accessories, microwave subclass, and door/drawer attributes only when an exact record description supports them. Store the source code/label that justified the attribute. Treat `FHD`, unpaired suffixes, fillers, and toe-kicks as literal/scoped vocabulary unless separately validated. [3][6]
6. **Match, then audit—not overwrite.** Match a target product using a controlled crosswalk (target distributor/line SKU plus a current source). Compare mapped historical family/configuration/dimensional-class hints against the target. Send disparities to an audit queue with both citations; do **not** overwrite the target’s price, availability, image, finish, construction, dimensions, or special geometry. [1]
7. **Require release evidence.** Before a mapping affects a Designer or production database, require: (i) a historical source pointer, (ii) an evidence status, (iii) a current target-line source for any physical/commercial field, (iv) parser/version traceability, and (v) automated tests proving no generated SKU or inferred geometry was introduced.

### Explicit non-adoption list

The following remain blocked until a decoded source schema and/or a matching current authoritative source establishes them:

- Inch width/depth/height, footprint, opening, or clearance from any embedded code digits.
- A 34.5-in. common base height; parsing of `B3524`, `BB3524`, or `BC3524`.
- Missing members of any code ladder; global R/L handedness; universal `-GL`, `-nRO`, `FHD`, or `-12` meanings.
- A universal toe-kick height/recess/assignment, filler size/placement, or cabinet-to-accessory bundling.
- A standard short-wall/stacker family based on specialty “Short” fields or Gallery rail stacking records; those are not evidence of a standard wall-cabinet stacking rule. [4]
- Current price, availability, photos, dimensions, construction, finish availability, or special geometry from the historical archive. [1]

## References

[1]: file:///home/ubuntu/cabinet-dealz/kcc-2020-source-inventory.md "KitchenCrest 2020 design-source inventory"

[2]: file:///home/ubuntu/kcc-2020-source/kcc-2020-searchable-records.txt "KitchenCrest 2020 searchable binary-record extract"

[3]: file:///home/ubuntu/cabinet-dealz/kcc-2020-analysis/base-analysis.md "KitchenCrest 2020 — Base Cabinet Evidence Analysis"

[4]: file:///home/ubuntu/cabinet-dealz/kcc-2020-analysis/wall-analysis.md "KitchenCrest 2020 — Wall Cabinet Evidence Analysis"

[5]: file:///home/ubuntu/cabinet-dealz/kcc-2020-analysis/tall-analysis.md "KitchenCrest 2020 tall-family evidence analysis"

[6]: file:///home/ubuntu/cabinet-dealz/kcc-2020-analysis/configuration-analysis.md "KitchenCrest 2020: configuration and nomenclature evidence"

[7]: file:///home/ubuntu/upload/KCC_2020_Design_Files.zip "KCC 2020 Design Files original archive (KITCR_21)"
