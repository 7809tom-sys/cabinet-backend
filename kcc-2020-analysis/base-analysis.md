# KitchenCrest 2020 — Base Cabinet Evidence Analysis

## Scope, provenance, and evidence standard

This is a **historical-source analysis only** of the supplied KitchenCrest catalog. It is not authority to replace current-line SKU availability, price, images, construction, or dimensions.

**Required inventory review completed first.** The inventory identifies the archive as *KitchenCrest Cabinets, LLC — Oct 2020*, catalog `KITCR_21`, with Imperial UOMS; it also warns that the binary record fields must be decoded before product dimensions are treated as established and that the archive is not a current sellable catalog ([`kcc-2020-source-inventory.md`, lines 3, 9–16, 23–30](../kcc-2020-source-inventory.md)).

### Sources used

| Source | Role in this report | Evidentiary limit |
|---|---|---|
| `kcc-2020-source-inventory.md` | Catalog provenance, record-type limits, adoption policy | The inventory itself flags `optkey2.dat`'s `34.5` association as **candidate** pending parser-level validation (line 15). |
| `kcc-2020-searchable-records.txt` — decoded printable runs from `kit1rec.dat`, `kit13rec.dat`, and `kit14rec.dat` | Product code existence, product labels, family/option vocabulary, code-to-record mappings | This is not a decoded dimensional specification table. Some lines are visibly truncated/corrupted by binary extraction. |
| `KCC_2020_Design_Files.zip` — `KITCR_21/DataPack/00_Settings.csv`, `kit14rec.dat`, `optkey2.dat` | Confirms `GlobalUOMS=Imperial`; supplies raw printable configuration/option strings | Raw binary strings prove string presence, not field relationships unless a parser establishes them. |

**Terminology below:** a *verified fact* is directly stated or directly paired in the supplied evidence. A *code width token* is the digits in a product code, **not** an asserted inch dimension unless the source says so.

---

## Verified findings

### 1. Base family taxonomy and explicitly named variants

| Verified historical family | Direct source evidence and examples | What is actually established |
|---|---|---|
| Standard door/drawer base | `kit1rec.dat` family header: “Base Door/Drawer Standard,” with 1-roll-out, 2-roll-out, vegetable-basket, and ironing-board alternatives ([`kcc-2020-searchable-records.txt`, lines 14–28](../kcc-2020-source/kcc-2020-searchable-records.txt)). | The catalog had a standard base-door/drawer family and those named option types. |
| Standard base / handed records | `B12R` and `B12L` are individual Base records (lines 44–59); subsequent examples include `B24R`, `B24L`, `B24`, `B27`, `B30`, `B33`, `B36`, `B39`, `B42`, `B45`, `B48` (lines 231–500). The inventory specifically identifies `B12L`/`B12R` etc. as handed bases (line 20). | These product codes existed; the source supports left/right handed base records where stated by the inventory. |
| Roll-out base variants | `B24-1RO` is labeled “Base w/1 Roll-Out Tray” and `B24-2RO` “Base w/2 Roll-Out Trays” (lines 289–300). `B39-4RO` is “Base w/4 Roll-Out Trays” (lines 418–430); the same explicit description pairing appears for `B42/B45/B48-2RO/-4RO` (lines 431–500). | Direct code-to-option pairings exist for `-1RO`, `-2RO`, and `-4RO` where shown. |
| Door/drawer bases | `B2D12R-2` is labeled “Base Door 2 Drawer”; the family includes `B2D…-2` variants and `B4D30-4` through `B4D48-4` labeled “Base Door 4 Drawer” ([lines 509–670](../kcc-2020-source/kcc-2020-searchable-records.txt)). | Door-plus-two-drawer and door-plus-four-drawer historical families existed. |
| All-drawer bases | The source labels `2DB12` “Base 2 Drawer,” `3DB12` “Base 3 Drawer,” `DB12` “Base 4 Drawer,” and `5DB12` “Base 5 Drawer” (lines 1653–1667; 1809–1825; 1959–1974; 2028–2043). The family headers explicitly include deep-drawer and glass alternatives, e.g., “Base 2 Drawers … w/Deep Drawers” / “w/Glass” (lines 1635–1651). | 2-, 3-, 4-, and 5-drawer base families and named deep/glass alternatives existed. |
| Full-door and shallow-depth base vocabulary | `Base Full Door Standard` is directly named (line 674). A related source row explicitly states `12"D` and contains `11100BB3512` (lines 677–684). Multiple `FDB…-12` codes also exist (e.g., `FDB12R-12`, lines 727–740). | **12-inch depth is explicitly named for that full-door base record.** The record does not establish 12-inch depth for every `-12` code or for all base families. |
| Other base special families | The extract directly labels base open shelf (`BOS…`), curved door, end diagonal, end square, angled end, radius cap, angle cap, desk drawer, range/curved-front, and 135° base families; examples include `BOS24`, `BCVD24R`, `BEOD12R`, `BES24R`, `BAE33R`, `BRC-R`, `BAC-R`, `BDD30`, and `BA135-18R` ([`kit1rec.dat` decoded runs; e.g., lines 2872–2935 and 3822–3836](../kcc-2020-source/kcc-2020-searchable-records.txt)). | Those named historical families/codes are valid vocabulary for audit/reference purposes; their physical geometry is not established here. |

### 2. Width-token ladders and increments — verified as code series, not verified inch dimensions

The extract and `kit13rec.dat` code map provide a clear **catalog-code ladder** for the ordinary `B` base family:

- `B12`, `B15`, `B18`, `B21`, `B24`, `B27`, `B30`, `B33`, `B36`, `B39`, `B42`, `B45`, `B48`; with handed entries at smaller values and selected unhanded/`-2` variants. The `kit13rec.dat` mapping lists this series consecutively ([`kcc-2020-searchable-records.txt`, lines 44595–44637](../kcc-2020-source/kcc-2020-searchable-records.txt)).
- The observed numeric tokens progress **12 → 15 → 18 → 21 → 24 → 27 → 30 → 33 → 36 → 39 → 42 → 45 → 48**, a consistent **+3 numeric-token increment**.
- Sink-base code records use the observed sequence `SB24R`, `SB24L`, `SB24`, `SB27`, `SB30`, `SB33`, `SB36`, `SB39`, `SB42`, `SB45`, `SB48` ([lines 2135–2255](../kcc-2020-source/kcc-2020-searchable-records.txt); mapped again at lines 45156–45176).
- The all-drawer ranges are narrower in the direct record series: 2-drawer and 3-drawer codes include 12/15/18/21/24 and “D” examples through 36; 4- and 5-drawer examples are 12/15/18/21/24 ([lines 1653–2043](../kcc-2020-source/kcc-2020-searchable-records.txt)).

> **Verified conclusion:** these are stable *numeric code-token ladders*. The supplied files do **not** explicitly state that `B24` means a 24-inch nominal cabinet width, so “inch width” must not be stored as a verified fact solely from this pattern.

### 3. Sink families and sink/corner variants

| Variant | Direct evidence | Verified scope |
|---|---|---|
| Standard sink base | `SB24R/SB24L/SB24`, `SB27`, `SB30`, `SB33`, `SB36`, `SB39`, `SB42`, `SB45`, `SB48` are directly labeled “Sink Base” ([lines 2135–2255](../kcc-2020-source/kcc-2020-searchable-records.txt)). | Sink-base family and code existence. |
| Cut-corner sink base | `SBC30`, `SBC33`, `SBC36`, `SBC39`, `SBC42`, `SBC45`, `SBC48` are directly labeled “Base Sink w/Cut Corner” (e.g., lines 2173–2178 and `kit13rec.dat` mapping lines 45180 onward). | The `SBC` examples are source-backed cut-corner sink-base codes. |
| Sink base with bottom drawer | `SBBD09R/L`, `SBBD12R/L`, `SBBD15R/L`, `SBBD18R/L`, `SBBD21R/L`, `SBBD24R/L`, `SBBD24`, `SBBD27`, `SBBD30`, `SBBD30-2`, through `SBBD48` are directly labeled “Sink Base Bottom Drawer” ([lines 2268–2410](../kcc-2020-source/kcc-2020-searchable-records.txt)). | This distinct sink-bottom-drawer family existed. |
| Full-height-door sink base | `SBFD24R/L`, `SBFD24`, `SBFD27`, `SBFD30`, etc. are labeled “Sink Base FHD”; `SBCFD30` and later examples are “Cut Corner Sink Base” ([lines 2422–2560](../kcc-2020-source/kcc-2020-searchable-records.txt)). | FHD and cut-corner FHD sink-family variants existed. “FHD” may be retained as source code/label text; do not expand it beyond the stated label without a controlled glossary. |
| Diagonal/corner sink base | `DSB33R/L`, `DSB36R/L`, and `DSB42R/L` are labeled “Diagonal Sink Base”; adjacent `BCD33/36/42` records are “Base Corner Diagonal” ([lines 4892–5083](../kcc-2020-source/kcc-2020-searchable-records.txt)). `BPFD48R` is associated with source labels “Base Corner Diagonal Standard” and “Sink Base Corner” (lines 4863–4890). | Diagonal corner-base and diagonal-sink-base families, including left/right code variants, existed. |
| Blind/corner base family | `BB36L/R` through `BB48L/R` are labeled “Base Blind”; related `BFDB…`, `BBP…`, and `BBPFD…` labels identify full-door and peninsula blind-base families ([lines 4460–4862](../kcc-2020-source/kcc-2020-searchable-records.txt)). | Historical blind/corner nomenclature and these codes are source-backed. |
| 135° base | `BA135-18R/L` and `BA135-21R/L` are directly labeled “Base 135o” (lines 2872–2935). | A separate 135° base family existed. |

### 4. Filler and toe-kick relationship evidence

**Fillers.** The historical catalog has a direct base-corner-filler vocabulary: `CCT48` and `BCF3` are labeled **“Base Corner Filler”**; `CF3` is **“Corner Filler Wizard”**; `WIZ-OKHKP` is **“Wizard Base Unit Angle-filler”** ([`kcc-2020-searchable-records.txt`, lines 6516–6547](../kcc-2020-source/kcc-2020-searchable-records.txt)). `kit14rec.dat` also contains the category string **“Base Fillers”** (decoded printable run at lines 98927–98929). This proves filler families/categories, **not** a mandated filler width, placement offset, or compatibility matrix.

**Toe kick.** `kit14rec.dat` has the configuration/action vocabulary:

- `placemolding;autotoekick;assigntoekick` ([`kcc-2020-searchable-records.txt`, line 100975](../kcc-2020-source/kcc-2020-searchable-records.txt));
- raw printable option labels/tokens: **“No Toe Kick” / `NO.TOE`**, **“Flush Toe Kick” / `FL.TOE`**, **“9\"H Toe Kick” / `9H.TOE`**, and **“Add Back Toe Kick” / `BACK.TOE`** (`KITCR_21/kit14rec.dat`, decoded printable strings from the supplied archive).

This is the only supported relationship statement: the historical design configuration recognized toe-kick assignment/automation and the named toe-kick choices. It does **not** establish a universal toe-kick height, that `9H.TOE` applies to every base, a physical clearance, or that a toe kick is bundled with any cabinet SKU.

### 5. Nominal dimension evidence

| Dimension topic | Status | Source-backed conclusion |
|---|---|---|
| Unit system | **Verified** | `DataPack/00_Settings.csv` says `GlobalUOMS=Imperial`. |
| 12-inch base depth | **Verified, limited** | The full-door base row explicitly says `12"D` and carries code/record string `11100BB3512` ([searchable extract lines 677–684](../kcc-2020-source/kcc-2020-searchable-records.txt)). A base angled-end source label also says `12"D w/Door` (lines 3822–3836). This is not a general base-depth rule. |
| 34.5 figure | **Candidate only** | `optkey2.dat` contains repeated `34.5` printable values; the inventory says these repeat with base codes including `B12`, `B24`, `SB30`, and `3DB24`, but explicitly requires parser-level validation before treating it as a standard base height (inventory line 15). |
| `B3524` / `BB3524` / `BC3524` strings | **Verified strings; dimensions unverified** | These recurring raw record strings appear beside base, drawer-base, sink-base, blind/corner-base, and filler records (e.g., `B24`/`B3524`, sink `SB30`/`B3524`, and base-corner filler `BCF3`/`BC3524`). The source supplies no decoded field schema demonstrating that the digits are height/depth. |
| Standard base actual H/W/D | **Not verified** | No supplied decoded product table states a universal ordinary-base height, depth, or nominal width in a dimension field. |

---

## Candidate normalization rules — useful only as review/audit hypotheses

These rules are **not production facts** and must be validated per current line/SKU from a current authoritative source:

1. **Store the digits after the leading family token as `code_width_token`, not `nominal_width_in`.** The B and SB ladders strongly suggest a three-step series, but no decoded dimension field equates the tokens to inches.
2. **Possible common-base configuration candidate:** `34.5` may be a historical base-height parameter because `optkey2.dat` repeats it near base-family evidence. Do not use it for geometry, elevation, price calculations, or overrides until the Raima option record field is parser-validated.
3. **Possible compact construction-token candidate:** `B3524`, `BB3524`, and `BC3524` may encode base-family dimensions/configuration. Preserve them verbatim as historical opaque tokens; do not parse them into 35/24 or 34.5/24 facts without schema proof.
4. **Suffix normalization may be allowed only when directly matched to a label:** retain `-1RO`, `-2RO`, `-4RO`, `-VB`, `-IRON`, and `-GL` as source tokens; attach an expanded description only for the individually evidenced code/label pairing. Do not extrapolate a suffix's semantics to every unobserved family.
5. **Treat L/R as historic handedness candidates at the data-model level.** The inventory calls B12L/B12R “handed bases,” but any current product mapping must verify actual handed availability and geometry by current line.
6. **Model filler/toe-kick behavior as optional configuration vocabulary, not a universal placement rule.** `autotoekick`/`assigntoekick` proves historical designer support, not current auto-placement behavior or a SKU relationship.

## Prohibited assumptions / implementation guardrails

- Do **not** equate `B24`, `SB30`, `DB24`, `BA135-18R`, or any other code digits with inch width, depth, height, opening size, or plan footprint merely from the name.
- Do **not** convert `B3524`, `BB3524`, or `BC3524` into `35 × 24`, `34.5 × 24`, or any other physical dimension. No decoded schema in the supplied evidence establishes that interpretation.
- Do **not** make `34.5` the standard base height. The inventory expressly marks this as needing parser-level validation.
- Do **not** infer that a missing member in a code ladder was offered, or that every family shares the ordinary-base ladder. Examples: drawer, sink-bottom-drawer, blind, diagonal, filler, and 135° families have different observed ranges.
- Do **not** infer the meaning of unpaired suffixes (`-2`, `D`, `-LS`, `-RB`, `FHD`, etc.) from naming resemblance alone. Keep such values opaque unless a direct source label for that exact item establishes the meaning.
- Do **not** infer universal toe-kick height, recess, inclusion, quantity, automatic placement, filler size, or adjacency rule from the labels/action strings.
- Do **not** use these historical records to overwrite current-line price, availability, images, actual dimensions, construction, finish availability, or special/corner geometry. Per the inventory adoption policy, any mismatch is an audit item, not an automatic update (lines 25–30).

## Recommended safe data treatment

Keep a historical-reference table with: `catalog_id=KITCR_21`, `source_period=Oct-2020`, `source_file`, `record_key`, `source_code`, `source_label`, `family`, `variant_text`, `code_width_token` (nullable), `dimension_status`, and `evidence_confidence`. Mark all inferred parsing as **candidate**; retain all dimensions as null unless directly confirmed by a decoded product-dimensional field or matching current-line evidence.
