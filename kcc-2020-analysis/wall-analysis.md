# KitchenCrest 2020 — Wall Cabinet Evidence Analysis

## Scope and evidence boundary

This report analyzes **only the supplied historical KitchenCrest 2020 design-source evidence** for wall cabinet families, code tokens, nominal dimensions, and the requested short/stacker/microwave/glass variants. It is **not** authority to change a current line’s prices, availability, photos, SKU set, depths, construction, or line-specific dimensions.

**Provenance.** The supplied inventory identifies `KCC_2020_Design_Files.zip` as KitchenCrest Cabinets, LLC, **Oct 2020**, catalog `KITCR_21`, Imperial units (`kcc-2020-source-inventory.md`, lines 1–3). The readable source used below is `kcc-2020-searchable-records.txt`, a printable-run extract of proprietary `kit1rec.dat`, `kit13rec.dat`, `kit14rec.dat`, and `optkey2.dat` records. The extract itself warns that binary printable runs are field-delimited and source order is preserved; therefore, an adjacent string is not automatically a parsed dimension (`kcc-2020-searchable-records.txt`, lines 11–13).

> **Interpretation rule:** a source label such as `30"H Wall w/Door` verifies a **historical nominal-height class**. A number merely embedded in a code is reported as a **token** unless the source also explicitly ties it to a dimension/class.

## Verified findings

### 1. Wall families and directly evidenced labels

| Historical family / variant | Verified evidence | Example code(s) / source |
|---|---|---|
| Standard wall, door and glass configurations | `kit14rec.dat` explicitly contains standard classes labeled `15"H`, `18"H`, `24"H`, `30"H`, `36"H`, `42"H`, `48"H`, `54"H`, and `60"H` Wall, Wall w/Door, and/or Wall w/Glass. The standard template is shown as `W#W#H#D@I` in several class definitions. | `kcc-2020-searchable-records.txt` / `kit14rec.dat`: `15"H Wall w/Door`, `15"H Wall w/Glass`; through `60"H Wall w/Door` and `60"H Wall w/Glass` (approximately source lines 72950–74795). `kit1rec.dat` examples: `W2415`, `W3018`, `W2424`, `W2430`, `W3036`, `W2442`, `W2448`. |
| One- and two-door nomenclature | The wall metadata explicitly uses `Wall 1 Door` and `Wall 2 Butt Doors`; it also uses `Wall 1 Glass Door` and `Wall 2 Glass Butt Doors`. | `kit14rec.dat` within the searchable extract; examples include `W0930L` under `Wall 1 Door`, `W3024` / `W3315` / `W3612` under `Wall 2 Butt Doors`, and `W2442GD` under `Wall 2 Glass Butt Doors` (around lines 100224–100261 and 100053–100055). |
| Glass wall variants | Product records directly label `-GL` examples `Wall w/Glass`; metadata also has a `GLASSDOOR` label. This verifies glass as a historical variant, not a material/construction specification. | `kit1rec.dat`: `W2415-GL`, `W3015-GL` → `Wall w/Glass` (15310–15330); `W2448-GL` (17038–17044); `W2748-GL` (17056–17062). `kit14rec.dat`: `GLASSDOOR`, `30"H Wall w/Glass`, etc. |
| Spice-rack wall variants | `Wall w/Spice Rack` is explicit for the listed `-SR` records. | `kit1rec.dat`: `W1530R-SR`, `W1530L-SR`, `W1830R-SR`, `W2130R-SR`, `W2430R-SR`; also 36-high examples such as `W1536R-SR` / `W2436L-SR` (e.g., 15712–15906 and 16555–16585). |
| Inverted Wall | `Inverted Wall` is a distinct named family, with an explicit `IW#W#H#D@I` template and discrete codes. | `kit1rec.dat`: `IW09R`, `IW09L`, `IW12R`, `IW21R/L`, `IW24R/L`; unhanded examples `IW24`, `IW27`, `IW30`, `IW33`, `IW36`, `IW39`, `IW42`, `IW45`, `IW48`. `kit14rec.dat`: `Inverted Wall`, `IW#W#H#D@I`, `IW09R` (around 57935–57954). |
| Wall Custom | `Wall Custom` is an explicit named family. | `kit1rec.dat`: `WCT18R/L`, `WCT21R/L`, `WCT24R/L`, `WCT24`, `WCT27`, `WCT30`, `WCT33`, `WCT36`; `kit14rec.dat` labels `Wall Custom` (around 80695–80704). |
| Refrigerator Wall | `Refrigerator Wall` is explicitly named and distinct from the standard W family. | `kit1rec.dat`: `RW2412`, `RW3012`, `RW3312`, `RW3612`; the same pattern continues at 15 high (`RW2415`, etc.). Do **not** conflate `RW` with standard `W`. |
| Microwave cabinet — with shelf | The source names a `Microwave Cabinet w/Shelf` class and a parameter template `MW#W#H#D`; `MW` code records are present. | `kit1rec.dat`: `MW2436`, `MW2736`, `MW3036`, `MW3336`, `MW3636` labeled `Microwave Cabinet` (20210–20300). `kit14rec.dat`: `Microwave Cabinet w/Shelf`, `MW#W#H#D`, `MW2436`, `MW2736`, `MW3036`, `MW3336`, `MW3636` (around 77390–77409). |
| Microwave cabinet — without shelf | The source names a `Microwave Cabinet w/o shelf` class and ties it to the `MWC#W#H#D` template and `MWC` records. | `kit1rec.dat`: `MWC2436`, `MWC2736`, `MWC3036`, `MWC3336`, `MWC3636` (20217–20308). `kit14rec.dat`: `Microwave Cabinet w/o shelf`, `MWC#W#H#D`. |
| Microwave cabinet — with drawer | The source names a `Microwave Cabinet w/Drawer` class and ties it to `MWD#W#H#D` and `MWD` records. | `kit1rec.dat`: `MWD2448`, `MWD2748`, `MWD3048`, `MWD3348`, `MWD3648`, each labeled `Microwave Cab. w/Drawer` (20225–20316). `kit14rec.dat`: `Microwave Cabinet w/Drawer`, `MWD#W#H#D`. |

### 2. Historical nominal-height evidence

The following values are **verified as the catalog’s named nominal wall-height classes**. The table does not claim every width/glass/door configuration was available at every height.

| Verified nominal-height class | Direct label evidence | Illustrative standard-W records in the same historical grouping |
|---:|---|---|
| 15 in. | `15"H Wall w/Door`; `15"H Wall w/Glass` | `W2415`, `W3015`, `W3315`, `W3615`; glass examples `W2415-GL`, `W3015-GL` |
| 18 in. | `18"H Wall w/Door`; `18"H Wall w/Glass` | `W2418`, `W3018`, `W3318`, `W3618`; glass examples `W1818R-GL`, `W2418-GL` |
| 24 in. | `24"H Wall w/Door`; `24"H Wall w/Glass` | `W1824R/L`, `W2124R/L`, `W2424`, `W2724`, `W3024`, `W3324`, `W3624` |
| 30 in. | `30"H Wall w/Door`; `30"H Wall w/Glass`; additionally `30"H Wall w/Spice Rack` | `W0930R/L` through `W4830`; `-SR` examples at widths represented by `W1530R/L-SR` through `W2430R/L-SR`; `-GL` examples are explicit |
| 36 in. | `36"H Wall w/Door`; `36"H Wall w/Glass`; additionally `36"H Wall w/Spice Rack` | `W0936R/L` through `W4836`; `-SR` examples `W1536R/L-SR` through `W2436R/L-SR` |
| 42 in. | `42"H Wall w/Door`; `42"H Wall w/Glass` | `W0942R/L`, `W1242R/L`, `W1542R/L`, `W1842R/L`, `W2142R/L`, `W2442`, `W2742`, `W3042`, `W3342`, `W3642` |
| 48 in. | `48"H Wall w/Door`; `48"H Wall w/Glass` | `W0948R/L`, `W1248R/L`, `W1548R/L`, `W1848R/L`, `W2148R/L`, `W2448`, `W2748`, `W3048`, `W3348`, `W3648` |
| 54 in. | `54"H Wall w/Door`; `54"H Wall w/Glass` | `W0954R/L`, `W1254R/L`, `W1554R/L`, `W1854R/L`, `W2154R/L`, `W2454`, `W2754`, `W3054`, `W3354`, `W3654` |
| 60 in. | `60"H Wall w/Door`; `60"H Wall w/Glass` | `W0960R/L`, `W1260R/L`, `W1560R/L`, `W1860R/L`, `W2160R/L`, `W2460`, `W2760`, `W3060`, `W3360`, `W3660` |

**Important boundary on 12.** `W2412` occurs in the raw records and is later labeled `Wall 2 Butt Doors` in metadata, but the supplied readable evidence does **not** provide a clean `12"H Wall` standard-class header tied to that code. It is therefore **not** included in the verified nominal-height set. The same caution applies to any product-specific dimensions inferred only from four-digit codes.

### 3. Observed increment pattern (code evidence, not a new dimension standard)

For standard W records that are explicitly grouped under the named height classes, the following **code-token series** is present:

- At the 30- and 36-high groups, observed first numeric tokens include `09, 12, 15, 18, 21, 24, 27, 30, 33, 36, 39, 42, 45, 48` (for example `W0930`, `W1230`, …, `W4830`; and `W0936`, `W1236`, …, `W4836`).
- At 42/48/54/60, the observed first numeric tokens are more limited, ending at `36` in the standard records cited above.
- At 15/18/24, the cited standard records also show limited subsets rather than a universal matrix.

This verifies a **three-unit progression in the observed numeric code tokens**, with height- and variant-specific omissions. It does **not**, by itself, prove that every token is a physical nominal width or that absent tokens are unavailable in a current product line.

### 4. “Short” and “stacker” evidence

- The supplied source does **not** name a standard wall cabinet family or standard-wall height as `Short`, `Short Wall`, or `Stacker`.
- `Short width` and `Short Dept`/`Short depth` occur as configuration vocabulary for **specialty end/cap geometry**, e.g., `24"H Wall End Angle` / `Wall End Angle Shelf` and `Wall Angle Cap` (`kit14rec.dat` around 80708–80716 and 84595–84613). Other `Short depth` hits are for base/tall specialty records. No number is supplied with those short-field labels.
- `*** Auto Stacking ***` and `Gallery Rail Stack (B)` are present, but in the **Gallery molding/rail** records (`kit1rec.dat` around 37676–37680; `kit14rec.dat` around 94125–94147), not as a wall cabinet product family. This is not evidence for a stackable wall-cabinet rule.

## Candidate normalization rules — useful only after parser-level validation

1. **Standard W grammar candidate:** Treat a standard-wall code of the visual form `W` + four digits (plus optional suffix) as a candidate normalized representation with a family token `W`, two numerical tokens, and a variant suffix. The historical templates `W#W#H#D@I`, plus the matching `15"H`–`60"H` class groupings, make the final two digits a strong candidate **height token** for codes contained in those explicit height groups. Store this as source-backed historical normalization, not as a global SKU rule.
2. **Width candidate:** In a code such as `W2430`, the leading `24` is a plausible nominal-width token because the template contains `#W`. The observed 3-unit sequence supports a candidate width increment of 3. However, the supplied printable extract does not expose a parsed field/value pair explicitly stating `W2430 width = 24 in.` Therefore, retain `width_token = "24"` and require a decoded record or matching current product source before populating a physical width field.
3. **Height candidate/verified hybrid:** For a code demonstrably in the `30"H` record group (e.g., `W2430`, `W3030`) it is reasonable to normalize the suffix `30` to the historical **nominal-height class 30 in.** This is stronger than a naming-only inference, but remains limited to that documented historical grouping.
4. **Variant token candidate with direct labels:** Normalize `-GL` as an explicit historical **glass-wall variant token** when its own record says `Wall w/Glass` (e.g., `W2415-GL`, `W2448-GL`), and `-SR` as **spice-rack** when the own record says `Wall w/Spice Rack`. Do not generalize either suffix to code strings lacking the corresponding product label.
5. **Microwave normalization candidate with direct family labels:** `MW`, `MWC`, and `MWD` may be normalized as historical microwave-cabinet subclasses respectively documented as with shelf, without shelf, and with drawer. Preserve the exact source code and label; do not infer appliance opening dimensions or overall cabinet dimensions from `MW2436`, `MWC2436`, or `MWD2448`.
6. **Separate specialty families:** Keep `IW` (Inverted Wall), `WCT` (Wall Custom), `RW` (Refrigerator Wall), and `MW*` (microwave) outside the standard W matrix unless a product-specific source explicitly establishes compatibility.

## Prohibited assumptions / audit guardrails

- Do **not** turn the observed `09`–`48` code-token sequence into a universal width list or fill missing W codes. The supplied evidence shows uneven matrices by height and variant.
- Do **not** assert a physical width merely from a code prefix (`W24…`, `MW24…`, `IW24…`) or assert a physical depth from the `#D` position in a template. No parsed, record-level dimensional values for those products were supplied here.
- Do **not** declare `W2412` to be a 24 × 12 wall cabinet, or declare a standard 12-in. wall class, from its name alone.
- Do **not** define `L`/`R` as handedness from the letter alone; the code variants exist, but the supplied extracts do not provide a direct left/right label for these standard-wall records.
- Do **not** treat ordinary unsuffixed `W` records as glass merely because some fragmented binary-run contexts contain `w/Glass`; only the directly labeled glass records establish that variant.
- Do **not** use `Short` specialty-field text or Gallery `Auto Stacking` text to create a wall short/stacker cabinet family or a stacking placement rule.
- Do **not** overwrite current-line prices, availability, images, SKU availability, depths, construction, or dimensions. Per `kcc-2020-source-inventory.md` (lines 23–30), any current-line mismatch is an **audit item**, not an automatic update.

## Source references

- `kcc-2020-source-inventory.md` — provenance, historical-use restriction, evidence limitations, and adoption policy.
- `kcc-2020-searchable-records.txt` — searchable printable-run evidence from `KITCR_21/kit1rec.dat`, `kit13rec.dat`, `kit14rec.dat`, and `optkey2.dat` in the supplied `KCC_2020_Design_Files.zip` archive. Key strings cited above include `W#W#H#D@I`, `MW#W#H#D`, `MWC#W#H#D`, `MWD#W#H#D`, `IW#W#H#D@I`, `Wall w/Glass`, `Wall w/Spice Rack`, and the named height classes.
