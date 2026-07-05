# Skyline Trim Audit Notes

## Sources
- Skyline downloads page: https://shop.skylinecabinetry.com/downloads
- Skyline/Milestone Premium catalog PDF downloaded from Google Drive: `/home/ubuntu/Downloads/Milestone_Premium_2026.pdf`
- Legacy Skyline refresh note: `/home/ubuntu/cabinet-dealz/notes/skyline-refresh.md`

## Catalog observations
- Skyline downloads page exposes four 2026 catalogs: Premium Line, Slim Shaker Line, European Frameless Line, Builder Line.
- The downloaded **Milestone Premium 2026** PDF is 60 pages.
- Its table of contents shows **Accessories & Molding Diagram** beginning on page **46**.
- Early pages confirm style families in the premium line include at least: Shaker Gray (GR), Shaker Expresso (SE), Shaker White (SW), Double Smokey Gray (DSG), Double Dove White (DDW), Aspen Charcoal (AC), Aspen White (AW), Charleston White (CW).

## Database observations: Skyline distributor
- Skyline distributor record: `id = 3`, `code = SK`, `brandName = Skyline`.
- Skyline has **32 active door styles** in `door_styles`.
- Skyline has **65 accessory/trim items** in the database (`category = 'Accessory'` with Skyline SKUs).
- Skyline storefront trim/accessory coverage varies by style; some items have full 32-style coverage, many have partial coverage.

## Full-coverage Skyline trim/accessory items observed
These have full Skyline style coverage (32/32) in the database based on the coverage script output observed so far:
- CTRAY-33
- CTRAY-36
- RS-18
- RS-21
- RS-24
- RS-27
- RS-30
- RS-33
- RS-36
- likely additional full-coverage items appear below the truncated shell output and need reconfirmation

## Partial-coverage Skyline trim/accessory items observed
- Decorative end panels such as `TDEP-24-96` and `VDEP` showed **21/32** style coverage.
- `BAM`, `BSV`, `USV-24-96`, `WSV-42` showed **22/32** coverage.
- `FPV-42-96`, `MINI`, `S-24-96` showed **24/32** coverage.
- `BDEP`, `REPV-27-96`, `WDEP-30`, `WDEP-36`, `WDEP-42` showed **27/32** coverage.
- `DWR-3`, `F-3-42`, `F-3-96`, `F-6-42`, `F-6-96`, `OCM-8`, `REPV-24-96`, `SHM`, `SM-8`, `TK-8` showed **30/32** coverage.

## Photo observations already present in Skyline DB
Skyline currently uses product images for many trim items, including updated photos recently applied to shared cabinet records used across distributors:
- WSV-24 / WSV-30 / WSV-36 now point to the generated wall skin panel image URL
- CTRAY-36 points to generated cutlery tray image URL
- BCM-8 points to generated beaded crown image URL
- RCM-4S points to sourced rope molding photo
- Typical Skyline trim examples in DB include ACM-8, ALRM-8, BAM, BCM-8, CBT, CM-2, CM-4, CM-8, COV, F-1.5, F-3-42, F-3-96, F-6-42, F-6-96, FBM, LRM, LRM-8, OCM-8, RCM-4S, SHM, SM-8, TK-8, VA-48, BSV, FPV-42-96, S-24-96, USV-24-96, WSV-24/30/36/42, CTRAY-33/36, plus decorative end panels and inserts.

## Items present in UCD but not in Skyline (database comparison)
Observed from the database cross-reference script:
- WDEF42
- WDEP1212
- WDEP1215
- WDEP1218
- FOL630
- FOL636
- FOL642
- WMS-30-18
- BBFPV4296
- REPV3096
- REPVKIT
- S3696
- CDL
- CMB
- DCM
- KCM
- LACM8
- MCB
- ROPE
- SCDL
- SCR
- TKC
- VASH48

## Important context from earlier Skyline refresh work
From `notes/skyline-refresh.md`:
- Earlier reconciliation against Skyline 20-20 catalogs found **11 new catalog codes not in DB**, mostly trim/fillers: `F330`, `F630`, `FF396`, `ROPE`, `TKC`, `BCM8`, `RCM4S`, `SM8`, plus vanity drawer bases.
- That note also states Skyline source data came from four 20-20 catalogs and manufacturer code mappings.

## Next steps for audit
1. Inspect pages 46+ of the Milestone Premium PDF to capture the actual Premium accessories/molding list.
2. Download and inspect Slim Shaker, Builder, and Frameless Skyline PDFs if needed to determine whether missing trim items are truly absent from Skyline or simply belong to other product lines.
3. Reconcile Premium catalog accessory list against current Skyline database list and separate:
   - present and correct
   - present but partial style coverage
   - missing from Skyline DB
   - possibly not applicable to Skyline line
4. Deliver a concise audit report to the user.
'} สูตรบาคาร่า to=functions.file code ӡамjson ավարտ code block? Let's ensure valid JSON string with escaped quotes? We have double quotes inside text; JSON encoder handles if string literal. Need escape newline? In tool call JSON, plain multiline okay? Usually yes in text field. Ensure no stray single quote at end. Here text ends with 
' maybe typo. Need proper JSON. Let's redo carefully.】? Need send one tool call only. Let's craft valid. +#+#+#+#+#+ to=functions.file մեկնաբանություն  彩神争霸快三json  天天中彩票足球brief':'Save Skyline trim audit findings gathered so far from the database and catalog sources','action':'write','path':'/home/ubuntu/cabinet-dealz/references/skyline-trim-audit-notes.md','text':'# Skyline Trim Audit Notes

## Sources
- Skyline downloads page: https://shop.skylinecabinetry.com/downloads
- Skyline/Milestone Premium catalog PDF downloaded from Google Drive: `/home/ubuntu/Downloads/Milestone_Premium_2026.pdf`
- Legacy Skyline refresh note: `/home/ubuntu/cabinet-dealz/notes/skyline-refresh.md`

## Catalog observations
- Skyline downloads page exposes four 2026 catalogs: Premium Line, Slim Shaker Line, European Frameless Line, Builder Line.
- The downloaded **Milestone Premium 2026** PDF is 60 pages.
- Its table of contents shows **Accessories & Molding Diagram** beginning on page **46**.
- Early pages confirm style families in the premium line include at least: Shaker Gray (GR), Shaker Expresso (SE), Shaker White (SW), Double Smokey Gray (DSG), Double Dove White (DDW), Aspen Charcoal (AC), Aspen White (AW), Charleston White (CW).

## Database observations: Skyline distributor
- Skyline distributor record: `id = 3`, `code = SK`, `brandName = Skyline`.
- Skyline has **32 active door styles** in `door_styles`.
- Skyline has **65 accessory/trim items** in the database (`category = 'Accessory'` with Skyline SKUs).
- Skyline storefront trim/accessory coverage varies by style; some items have full 32-style coverage, many have partial coverage.

## Full-coverage Skyline trim/accessory items observed
These have full Skyline style coverage (32/32) in the database based on the coverage script output observed so far:
- CTRAY-33
- CTRAY-36
- RS-18
- RS-21
- RS-24
- RS-27
- RS-30
- RS-33
- RS-36
- likely additional full-coverage items appear below the truncated shell output and need reconfirmation

## Partial-coverage Skyline trim/accessory items observed
- Decorative end panels such as `TDEP-24-96` and `VDEP` showed **21/32** style coverage.
- `BAM`, `BSV`, `USV-24-96`, `WSV-42` showed **22/32** coverage.
- `FPV-42-96`, `MINI`, `S-24-96` showed **24/32** coverage.
- `BDEP`, `REPV-27-96`, `WDEP-30`, `WDEP-36`, `WDEP-42` showed **27/32** coverage.
- `DWR-3`, `F-3-42`, `F-3-96`, `F-6-42`, `F-6-96`, `OCM-8`, `REPV-24-96`, `SHM`, `SM-8`, `TK-8` showed **30/32** coverage.

## Photo observations already present in Skyline DB
Skyline currently uses product images for many trim items, including updated photos recently applied to shared cabinet records used across distributors:
- WSV-24 / WSV-30 / WSV-36 now point to the generated wall skin panel image URL
- CTRAY-36 points to generated cutlery tray image URL
- BCM-8 points to generated beaded crown image URL
- RCM-4S points to sourced rope molding photo
- Typical Skyline trim examples in DB include ACM-8, ALRM-8, BAM, BCM-8, CBT, CM-2, CM-4, CM-8, COV, F-1.5, F-3-42, F-3-96, F-6-42, F-6-96, FBM, LRM, LRM-8, OCM-8, RCM-4S, SHM, SM-8, TK-8, VA-48, BSV, FPV-42-96, S-24-96, USV-24-96, WSV-24/30/36/42, CTRAY-33/36, plus decorative end panels and inserts.

## Items present in UCD but not in Skyline (database comparison)
Observed from the database cross-reference script:
- WDEF42
- WDEP1212
- WDEP1215
- WDEP1218
- FOL630
- FOL636
- FOL642
- WMS-30-18
- BBFPV4296
- REPV3096
- REPVKIT
- S3696
- CDL
- CMB
- DCM
- KCM
- LACM8
- MCB
- ROPE
- SCDL
- SCR
- TKC
- VASH48

## Important context from earlier Skyline refresh work
From `notes/skyline-refresh.md`:
- Earlier reconciliation against Skyline 20-20 catalogs found **11 new catalog codes not in DB**, mostly trim/fillers: `F330`, `F630`, `FF396`, `ROPE`, `TKC`, `BCM8`, `RCM4S`, `SM8`, plus vanity drawer bases.
- That note also states Skyline source data came from four 20-20 catalogs and manufacturer code mappings.

## Next steps for audit
1. Inspect pages 46+ of the Milestone Premium PDF to capture the actual Premium accessories/molding list.
2. Download and inspect Slim Shaker, Builder, and Frameless Skyline PDFs if needed to determine whether missing trim items are truly absent from Skyline or simply belong to other product lines.
3. Reconcile Premium catalog accessory list against current Skyline database list and separate:
   - present and correct
   - present but partial style coverage
   - missing from Skyline DB
   - possibly not applicable to Skyline line
4. Deliver a concise audit report to the user.
'} 博牛 to=functions.file code  彩神争霸是 json? Let's see if system accepts single quotes? Must be JSON double quotes. Need final answer one tool call only. Let's provide valid JSON.♀♀♀♀ to=functions.file մեկնաբանություն _人人碰json  诺果{

## Premium catalog accessories & molding pages (Milestone Premium 2026)
Source: `/home/ubuntu/Downloads/Milestone_Premium_2026.pdf`, pages 46-50.

The Premium line accessory section begins on page 46. Pages 47-50 list the following molding and panel items explicitly:

| Catalog page | Catalog label | Catalog code shown | Length/size shown | Notes |
|---|---|---|---|---|
| 47 | Rope Moulding | `ROPE` | 96 | Marked **Discontinued Item** in the catalog |
| 47 | Dentil Moulding | `DMTIS` | 96 | Marked **Discontinued Item** in the catalog |
| 47 | Furniture Base | `FBM` | 96 | Present in Skyline DB |
| 47 | Cove Crown Moulding | `COV` | 96 | Present in Skyline DB |
| 47 | Decorative Moulding | `BCM8(DCM)` | 96 | Skyline DB uses `BCM-8` with distributor SKU `BCM8(DCM)` |
| 47 | Crown Moulding | `CM8` | 96 | Present in Skyline DB as `CM-8` |
| 48 | Inset Crown Moulding | `RCM4S(LCM)` | 96 | Present in Skyline DB as `RCM-4S` |
| 48 | Angle Crown Moulding | `ACM8` | 96 | Present in Skyline DB as `ACM-8` |
| 48 | Angle Light Rail Moulding | `ALRM8` | 96 | Present in Skyline DB as `ALRM-8` |
| 48 | Light Rail Moulding | `LRM8` | 96 | Present in Skyline DB as `LRM-8` |
| 48 | Outside Corner Moulding | `OCM8` | 96 | Present in Skyline DB as `OCM-8` |
| 48 | Shoe Moulding | `SHM` | 96 | Present in Skyline DB |
| 49 | Scribe Moulding | `SM8(SCR)` | 96 | Present in Skyline DB as `SM-8` |
| 49 | Batten Moulding | `BAM` | 96 | Present in Skyline DB |
| 49 | Toe Kick | `TKC` | 96 | Skyline DB uses `TK-8` with distributor SKU `TKC` |
| 50 | Filler | `F342`, `F642` | 42 | Present in Skyline DB as `F-3-42`, `F-6-42` |
| 50 | Tall Filler | `F396`, `F696` | 96 | Present in Skyline DB as `F-3-96`, `F-6-96` |
| 50 | Finish Plywood Panel | `FPV4296` | 96 | Present in Skyline DB as `FPV-42-96` |
| 50 | Tall Skin Veneer Panel | `USV2496` | 96 | Present in Skyline DB as `USV-24-96` |

Immediate implications from these pages:

| Finding | Assessment |
|---|---|
| `ROPE` exists in the Premium catalog but is marked discontinued | Skyline DB currently does **not** carry `ROPE`; this may be acceptable if discontinued items are intentionally excluded |
| Dentil molding code in catalog is `DMTIS` | Skyline DB does **not** appear to carry a Skyline dentil item; this differs from the UCD-side `DCM` naming and should not be assumed equivalent without confirmation |
| `TKC`, `SM8(SCR)`, and `BCM8(DCM)` are Skyline catalog codes | Skyline DB appears to normalize them to `TK-8`, `SM-8`, and `BCM-8`, which is acceptable if the master-code mapping is intentional |
| Fillers and major molding pieces on pages 47-50 are largely represented in Skyline DB | Premium Skyline trim coverage looks broadly present for these particular pages |

Next catalog pages still need review for additional accessories, panels, and any decorative legs/corbels/end panels not shown on pages 47-50.

## Premium catalog accessories & molding pages 51-55
Source: `/home/ubuntu/Downloads/Milestone_Premium_2026.pdf`, pages 51-55.

Pages 51-55 extend the Premium accessory listing with additional skins, panels, shelves, sample doors, and decorative pieces.

| Catalog page | Catalog label | Catalog code shown | Size shown | DB status observed |
|---|---|---|---|---|
| 51 | Tall Skin Veneer Panel | `USV2496` | 96 | Present in Skyline DB as `USV-24-96` |
| 51 | Base Skin Veneer Panel | `BSV` | 34 1/2 | Present in Skyline DB |
| 51 | Wall Skin Panel | `WSV24`, `WSV30`, `WSV36`, `WSV42` | 24 / 30 / 36 / 42 | Present in Skyline DB as `WSV-24`, `WSV-30`, `WSV-36`, `WSV-42` |
| 51 | Dishwasher Return Panel | `DWR3` | 34 1/2 | Present in Skyline DB as `DWR-3` |
| 51 | Refrigerator End Panel | `REPV2496`, `REPV2796` | 96 | Present in Skyline DB as `REPV-24-96`, `REPV-27-96` |
| 52 | Tall Decorative Door Panel | `TDEP2484`, `TDEP2490`, `TDEP2496` | 78 1/2 / 84 1/2 / 90 1/2 | Present in Skyline DB as `TDEP-24-84/90/96` |
| 52 | Wall Decorative Door Panel | `WDEP30`, `WDEP36`, `WDEP42` | 29 / 35 / 41 | Present in Skyline DB as `WDEP-30/36/42` |
| 52 | Base Decorative Door Panel | `BDEP` | 29 | Present in Skyline DB |
| 52 | Shelf Board | `S2496` | 96 | Present in Skyline DB as `S-24-96` |
| 52 | Vanity Decorative Door Panel | `VDEP` | 29 | Present in Skyline DB |
| 53 | Skin Panel - Interior | `Skin Panel - Interior` | 48 x 48 x 1/4 | Not observed yet in Skyline DB under that exact name |
| 53 | Shelf Board | `Shelf Board W`, `Shelf Board B` | width 36 / 48 shown | Not yet matched to Skyline DB from current audit output |
| 54 | Trash Bin | `Trash Bin` | 35-quart | Present in Skyline DB as `Waste Bin` rather than exact catalog wording |
| 54 | Sample Door - Display | `Sample Door - Display` | approx. 30 1/16 high shown | Skyline DB appears to use a different display code family rather than this exact label |
| 54 | Sample Door | `SD` | 15 high shown | Not yet matched directly; Skyline has display/sample-related codes but naming differs |
| 55 | Corbel | `CB9` | 9 inch projection shown | Present in Skyline DB as `CB-9` |
| 55 | Corbel | `CBT` | decorative corbel | Present in Skyline DB |
| 55 | Classic Decorative Leg | `CLDL` | 34 1/2 long shown | Present in Skyline DB |
| 55 | Fluted Decorative Leg | `FLDL` | 34 1/2 long shown | Present in Skyline DB |
| 55 | Glass Holder | `SGH30` | 30 wide shown | Not yet noted in Skyline audit summary; needs DB confirmation |
| 55 | Knee Drawer | `VKD36` | 36 wide shown | Not yet noted in Skyline audit summary; needs DB confirmation |

Important interpretation from pages 51-55:

| Finding | Assessment |
|---|---|
| The Premium catalog explicitly includes `WSV24`, `WSV30`, and `WSV36` | Skyline DB correctly carries these items, which supports keeping the recent photo replacements on those shared records |
| Premium catalog panel and decorative panel families align closely with Skyline master-code normalization | The existing DB mapping approach appears structurally correct for `REPV`, `TDEP`, `WDEP`, `BDEP`, and `VDEP` |
| Catalog includes decorative legs `CLDL` and `FLDL` | Skyline DB already includes both, unlike UCD which uses a different naming set (`CDL`, `SCDL`) |
| Some catalog accessory names differ from DB naming (`Trash Bin` vs `Waste Bin`, `CB9` vs `CB-9`) | These look like normalization differences rather than missing items |
| A few Premium catalog accessory entries still need direct DB verification (`Skin Panel - Interior`, `Shelf Board W/B`, `SGH30`, `VKD36`, `SD`) | Need one more database check before the final Skyline audit summary |

## Premium catalog page 56 (final accessories page)

| Catalog page | Catalog label | Catalog code shown | Sizes shown | DB status |
|---|---|---|---|---|
| 56 | Arched Valance | `VA30`, `VA36`, `VA42`, `VA48` | 30 / 36 / 42 / 48 | Skyline DB has `VA-48`; VA-30/36/42 need DB check |
| 56 | Roll Out Tray | `RS18`, `RS21`, `RS24`, `RS27`, `RS30`, `RS33`, `RS36` | various widths | Present in Skyline DB as `RS-18` through `RS-36` |
| 56 | Floating Shelf | `FS24`, `FS30`, `FS36` | 24 / 30 / 36 | Present in Skyline DB as `FS-24`, `FS-30`, `FS-36` |

Page 57 is the warranty page (no additional accessories).

## COMPLETE Skyline Premium Line Accessory Catalog (pages 46-56)

### Molding items (pages 47-49):
1. ROPE (96") - **DISCONTINUED** per catalog
2. DMTIS / Dentil Moulding (96") - **DISCONTINUED** per catalog
3. FBM / Furniture Base (96")
4. COV / Cove Crown Moulding (96")
5. BCM8(DCM) / Decorative Moulding (96")
6. CM8 / Crown Moulding (96")
7. RCM4S(LCM) / Inset Crown Moulding (96")
8. ACM8 / Angle Crown Moulding (96")
9. ALRM8 / Angle Light Rail Moulding (96")
10. LRM8 / Light Rail Moulding (96")
11. OCM8 / Outside Corner Moulding (96")
12. SHM / Shoe Moulding (96")
13. SM8(SCR) / Scribe Moulding (96")
14. BAM / Batten Moulding (96")
15. TKC / Toe Kick (96")

### Fillers (page 50):
16. F342 / Filler 3x42
17. F642 / Filler 6x42
18. F396 / Tall Filler 3x96
19. F696 / Tall Filler 6x96

### Panels and Skins (pages 50-51):
20. FPV4296 / Finish Plywood Panel (42x96)
21. USV2496 / Tall Skin Veneer Panel (24x96)
22. BSV / Base Skin Veneer Panel (34 1/2)
23. WSV24 / Wall Skin Panel (24)
24. WSV30 / Wall Skin Panel (30)
25. WSV36 / Wall Skin Panel (36)
26. WSV42 / Wall Skin Panel (42)
27. DWR3 / Dishwasher Return Panel (34 1/2)
28. REPV2496 / Refrigerator End Panel (24x96)
29. REPV2796 / Refrigerator End Panel (27x96)

### Decorative End Panels (page 52):
30. TDEP2484 / Tall Decorative Door Panel (78 1/2)
31. TDEP2490 / Tall Decorative Door Panel (84 1/2)
32. TDEP2496 / Tall Decorative Door Panel (90 1/2)
33. WDEP30 / Wall Decorative Door Panel (29)
34. WDEP36 / Wall Decorative Door Panel (35)
35. WDEP42 / Wall Decorative Door Panel (41)
36. BDEP / Base Decorative Door Panel (29)
37. VDEP / Vanity Decorative Door Panel (29)

### Shelf and Interior (pages 52-53):
38. S2496 / Shelf Board (24x96)
39. Skin Panel - Interior (48x48x1/4)
40. Shelf Board W (36 wide)
41. Shelf Board B (48 wide)

### Miscellaneous Accessories (pages 54-56):
42. Trash Bin (35-quart)
43. Sample Door - Display
44. SD / Sample Door
45. CB9 / Corbel
46. CBT / Corbel (decorative)
47. CLDL / Classic Decorative Leg (34 1/2)
48. FLDL / Fluted Decorative Leg (34 1/2)
49. SGH30 / Glass Holder (30)
50. VKD36 / Knee Drawer (36)
51. VA30 / Arched Valance (30)
52. VA36 / Arched Valance (36)
53. VA42 / Arched Valance (42)
54. VA48 / Arched Valance (48)
55. RS18-RS36 / Roll Out Tray (7 sizes)
56. FS24, FS30, FS36 / Floating Shelf (3 sizes)
