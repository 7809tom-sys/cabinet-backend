# KitchenCrest 2020 tall-family evidence analysis

**Scope.** This report analyzes only the supplied historical KitchenCrest source package. It documents source-supported tall, utility, pantry, oven, refrigerator-panel, and vanity-tall evidence. It is **not** a current catalog, pricing, availability, image, or line-specific dimension authority.

## Conclusion

The historical catalog is **KitchenCrest Cabinets, LLC — Oct 2020**, catalog `KITCR_21`, using Imperial units. [1] [4] It explicitly contains tall families at **84, 90, and 96 inches high**, which are adjacent **6-inch height increments**, across utility, pantry, carousel-pantry, several oven configurations, and vanity-linen families. The record text also expressly identifies 24-inch- and 12-inch-deep **utility** series. Other family code strings frequently resemble dimension tokens, but the source does not consistently label every token position as a physical dimension. Those parses remain candidates, not facts.

## Verified evidence

### Historical provenance and safe-use boundary

The source inventory identifies the package as historical and states that it may inform explicit structural vocabulary, but may not overwrite actual current-line SKU availability, prices, photos, depth, construction, or special geometry. [1] `CatInfo.Xml` names the catalog `KITCR_21`, the manufacturer, and the October 2020 description; `00_Settings.csv` reports `GlobalUOMS,Imperial`. [4] [5]

### Utility / tall-utility families

The searchable records expressly label standard utility series as **84, 90, and 96 inches high by 24 inches deep**, and separately as **84, 90, and 96 inches high by 12 inches deep**. Examples are `84"H 24"D Utility` (lines 66638–66648), `90"H 24"D Utility` (66905–66915), `96"H 24"D Utility` (67172–67182), plus `84"H 12"D Utility` (66816–66824), `90"H 12"D Utility` (67083–67091), and `96"H 12"D Utility` (67351–67360). [2]

| Verified utility evidence | Source-backed examples | What it establishes |
|---|---|---|
| 24-inch-deep standard utility | `U1284R` / `U1284L`, `U1584R` / `U1584L`, `U1884R` / `U1884L`; `U1290R` / `U1290L`; `U1296R` / `U1296L` | The examples occur in the explicitly labelled 84/90/96-inch-high, 24-inch-deep utility blocks. (`kcc-2020-searchable-records.txt`, lines 66640–66727; 66907–66994; 67174–67219) [2] |
| 12-inch-deep standard utility | `U128412R` / `U128412L`, `U158412R` / `U158412L`; `U129012R` / `U129012L`; `U129612R` / `U129612L` | The examples occur in explicitly labelled 84/90/96-inch-high, 12-inch-deep utility blocks. (`kcc-2020-searchable-records.txt`, lines 66818–66904; 67085–67171; 67354–67440) [2] |
| Roll-out utility | `U1584R-RO` / `U1584L-RO`; `U1590R-RO` / `U1590L-RO`; `U1596R-RO` / `U1596L-RO` | The source calls these `Utility w/4 RO` / “w/4 Roll-Out” within the corresponding 24-inch-deep utility blocks. (`kcc-2020-searchable-records.txt`, lines 66730–66815; 66995–67082; 67262–67350) [2] |
| 2020 record label variants | `U189024R` / `U189024L`, `U189624R` / `U189624L` are labelled `Tall Utility 2 Doors`; `U249024`, `U249624`, `U308424`, and `U309624` occur beside `Tall Utility 4 Butt Doors`. | These are verified code/family associations, but the nearby export order does **not** safely attach a physical dimension to each individual code. (`kcc-2020-searchable-records.txt`, lines 99515–99531; 100326–100337) [2] |

The source explicitly declares two individual `Tall Utility 2 Doors` R/L pairs as mirrors: `U189024R` ↔ `U189024L` and `U189624R` ↔ `U189624L`. (`AutoMirrorRelations.Txt`, lines 21–22) [3] The broader older utility blocks visibly contain R- and L-suffixed examples, but no blanket mirror claim should be made for every utility code merely because it ends in `R` or `L`.

### Pantry families

The records explicitly provide **84-, 90-, and 96-inch-high Pantry** family headings. They show `P1884R` / `P1884L` and `P3684` for 84-inch, `P1890R` / `P1890L` and `P3690` for 90-inch, and `P1896R` / `P1896L` and `P3696` for 96-inch examples. (`kcc-2020-searchable-records.txt`, lines 67443–67536) [2] They also explicitly identify **Carousel Pantry** at each same height: `LSP2484R` / `LSP2484L`, `LSP2490R` / `LSP2490L`, and `LSP2496R` / `LSP2496L`. (`kcc-2020-searchable-records.txt`, lines 67537–67612) [2]

The pantry headings prove their stated heights. They do **not** expressly state depth in the human-readable product headings, so this report does not convert the `8424`, `9024`, or `9624` portions of adjacent configuration strings into verified 24-inch depths.

### Oven and oven/microwave tall families

Five oven-oriented families are explicitly named at 84, 90, and 96 inches high: **Single Oven**, **Double Oven**, **Oven/Microwave**, **Single Oven/Drawer**, and **Double Oven w/tambour**. (`kcc-2020-searchable-records.txt`, lines 68368–68866) [2] Representative observed codes include:

| Explicit family and height examples | Observed code strings |
|---|---|
| 84-inch Single Oven / Double Oven / Oven-Microwave | `SO2484`, `DO2484`, `OMW2484` (with 27- and 30-series examples also present) (`kcc-2020-searchable-records.txt`, lines 68368–68463) [2] |
| 90-inch Single Oven / Double Oven / Oven-Microwave | `SO2490`, `DO2490`, `OMW2490` (`kcc-2020-searchable-records.txt`, lines 68543–68631) [2] |
| 96-inch Single Oven / Double Oven / Oven-Microwave | `SO2496`, `DO2496`, `OMW2496` (`kcc-2020-searchable-records.txt`, lines 68705–68798) [2] |
| Single Oven/Drawer and Double Oven w/tambour | `SOD2484` / `DOT2484`, `SOD2490` / `DOT2490`, `DOT2496` (`kcc-2020-searchable-records.txt`, lines 68464–68532; 68633–68700; 68800–68866) [2] |

A separate 2020-era label, `Tall Oven- Microwave Combo`, is directly associated with code `O338424` in the searchable export. (`kcc-2020-searchable-records.txt`, lines 98571–98572) [2] Other observed codes near the same labelled records include `O339024` and `O339624`. (`kcc-2020-searchable-records.txt`, lines 99500–99513; 100310–100324) [2] The excerpt does **not** provide a reliable one-to-one height/width/depth association for those `O...` codes, so none is claimed.

No explicit mirror relation was found for the oven code examples above. Do not infer handedness from an appliance family name.

### Refrigerator family evidence

The source identifies **Refrigerator End Panel** rather than a refrigerator cabinet. Verified code/label pairings include `REPV2496R`, `REPV2496L`, `REPV2796R`, `REPV2796L`, and a separate `REPV30120R` / `REPV30120L` pair. (`kcc-2020-searchable-records.txt`, lines 99476–99488; 98026–98041) [2] The archived `AutoMirrorRelations.Txt` explicitly declares the `REPV2496R` ↔ `REPV2496L`, `REPV2796R` ↔ `REPV2796L`, and `REPV30120R` ↔ `REPV30120L` pairs as mirrors. (`AutoMirrorRelations.Txt`, lines 23–25) [3]

The numerals in these panel codes must not be published as verified width or height measurements without a parser-level field mapping or a product record that states the dimensions. In particular, the `96` and `120` code substrings are **not** sufficient by themselves to establish a panel dimension.

### Vanity-tall evidence

The record set contains tall vanity storage families, though it does not use the literal phrase “vanity tall.” It explicitly labels **Vanity Linen**, **Vanity Linen Hamper**, and **Vanity Linen w/Drawers** at **84, 90, and 96 inches high**. (`kcc-2020-searchable-records.txt`, lines 69798–70407) [2]

* Vanity Linen examples: `VL1884R` / `VL1884L`, `VL1890R` / `VL1890L`, and `VL1896R` / `VL1896L`; 21- and 24-series examples also appear (`VL2184R`, `VL2484R`, etc.). (`kcc-2020-searchable-records.txt`, lines 69805–69981) [2]
* Vanity Linen Hamper examples: observed R/L image-code pairs include `VLH1884R` / `VLH1884L`, `VLH1890R` / `VLH1890L`, and `VLH1896R` / `VLH1896L`. (`kcc-2020-searchable-records.txt`, lines 69985–70185) [2]
* Vanity Linen with Drawers examples: the source pairs internal-looking `VLT...D/G` strings with rendered `VLD...R/L` codes, such as `VLT1884D` beside `VLD1884R.jpg` and `VLT1884G` beside `VLD1884L.jpg`; the same structure appears at 90 and 96 inches. (`kcc-2020-searchable-records.txt`, lines 70188–70407) [2]

These blocks verify the family labels, height tiers, and observed code strings. The record extract alone does not define all `D/G` tokens, nor does it declare AutoMirror relations for the vanity examples. Treat a proposed global R/L, D/G, or 18/21/24 token decoder as a candidate until separately validated.

## Code-token evidence and candidate normalization rules

The following are useful **candidate** rules for a staged mapping layer. They are not production facts and must be rejected when a line-specific source disagrees.

| Candidate rule | Supporting pattern | Limitation |
|---|---|---|
| `#W`, `#H`, and `#D` are formal variable positions in tall templates. | Utility templates explicitly show `U#W#H#D@I`; pantry and carousel templates show `P#W#H#D@...` and `LSP#W#H#D@I`. (`kcc-2020-searchable-records.txt`, lines 66645–66648; 67448–67451; 67547–67550) [2] | The templates do not, by themselves, validate every concrete code’s character segmentation. |
| In the utility series, 84/90/96 appear to be height tokens and terminal `12` appears to distinguish the explicit 12-inch-deep variants. | Compare the 24-inch labels and examples `U1284R`, `U1290R`, `U1296R` with the explicit 12-inch blocks `U128412R`, `U129012R`, `U129612R`. (`kcc-2020-searchable-records.txt`, lines 66640–66661; 66818–66837; 66907–66928; 67085–67104; 67174–67195; 67354–67373) [2] | This is a strong series-specific candidate, not authorization to decode unrelated `U` codes or current-line SKUs. |
| Pantry, carousel-pantry, oven, and vanity-linen strings likely carry width/height/depth and/or handing information. | Examples repeat families across 84/90/96 and show R/L variants. (`kcc-2020-searchable-records.txt`, lines 67443–67612; 68368–68866; 69805–70407) [2] | The present evidence does not expressly map every digit to a nominal dimension or universally define suffix semantics. |
| `-RO` marks the utility roll-out configuration. | The source calls the products `Utility w/4 RO` and shows `U...-RO` code strings. (`kcc-2020-searchable-records.txt`, lines 66730–66815) [2] | Count and configuration must still be verified at the particular SKU/product record. |
| `REPV` is a refrigerator-end-panel code family and R/L equivalents are mirror candidates only where AutoMirror lists the exact pair. | Explicit labels and mirror pairs are present for 24/96, 27/96, and 30/120. (`kcc-2020-searchable-records.txt`, lines 98026–98041; 99476–99488) [2] (`AutoMirrorRelations.Txt`, lines 23–25) [3] | Do not apply the relationship to an unlisted `REPV` code without evidence. |

## Prohibited assumptions

1. **Do not treat 84/90/96 as universal tall availability.** They are verified recurring historical tiers for the families documented above; they do not prove every tall family, width, depth, finish, or current line is offered at all three heights.
2. **Do not infer physical dimensions solely from a code.** `REPV2496`, `O338424`, `SO2484`, `VL1884`, and similar strings need an explicit field mapping or dimensional product record before their numerals are used as dimensions.
3. **Do not equate an observed R/L suffix with proven handedness for every family.** Only the listed utility and refrigerator pairs have direct `AutoMirrorRelations.Txt` support. The source’s view orientation and semantic left/right convention are not stated in the supplied evidence.
4. **Do not treat `D/G` as a verified handedness decoder.** The vanity-linen-with-drawers source shows `VLT...D/G` alongside `VLD...R/L` rendered-code strings, but supplies no explicit legend.
5. **Do not promote `Tall Oven- Microwave Combo` code adjacency into a dimension mapping.** The searchable export’s nearby 84/90/96 strings are not sufficiently record-bounded to link a precise dimension set to `O338424`, `O339024`, or `O339624`.
6. **Do not use this material to overwrite current-line prices, availability, images, construction, depth, or special geometry.** The source inventory expressly limits the historical archive to reference and audit use. [1]

## References

[1]: file:///home/ubuntu/cabinet-dealz/kcc-2020-source-inventory.md "KitchenCrest 2020 design-source inventory"
[2]: file:///home/ubuntu/kcc-2020-source/kcc-2020-searchable-records.txt "KitchenCrest 2020 searchable records"
[3]: file:///home/ubuntu/upload/KCC_2020_Design_Files.zip "KCC 2020 design files archive — KITCR_21/AutoMirrorRelations.Txt"
[4]: file:///home/ubuntu/kcc-2020-source/CatInfo.Xml "KitchenCrest KITCR_21 catalog metadata"
[5]: file:///home/ubuntu/upload/KCC_2020_Design_Files.zip "KCC 2020 design files archive — KITCR_21/DataPack/00_Settings.csv"
