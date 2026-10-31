# DL unmatched SKUs: findings (90 items)

Rule applied (standing, all suppliers): nomenclature first -> find the master -> if none, create a NEW master whose code and alias is the supplier code. Masters were searched in `cabinet-descriptions-corrected-2026-10-26.xlsx` (the live DB was not queryable), so **every "matched" master must be confirmed in the live catalog before the SQL is run**. The 110 already-matched rows are unchanged (verified by the test).

| Result | Count |
|---|---|
| Mapped to an existing master (exact / dimension / nomenclature) | 28 |
| Aliased onto an existing master (SP09 -> SPB9, BWBKT18 -> BWB18, 2DB33 -> B33) | 3 |
| NEW hidden masters (`isActive`, `showInDesigner`, `showInCatalog`, `showIn2020` all 0) | 20 |
| Report only (accessory / trim / no master matched) | 38 |
| Skipped (pending Rich) | 1 (QUARTER DOOR) |
| **Total** | **90** |

Full per-item list with reasons: `dl_unmatched_report.csv` (also the `note` column of `dl_crosswalk.csv`).

## Tom's decisions, Oct 31, 2026 (all applied)
1. **FDB18-36 -> B18FH-B36FH**: unchanged. FDB09 remains a hidden new master (price list only).
2. **Glass doors**: WG1530/1536/1542/1830/1836/1842 map to the existing W1530GD...W1842GD (a WG item is the glass DOOR only, not a cabinet).
3. **Glass pricing**: a W####GD / DCW####GD SKU is never priced as the door alone. `listPrice = plain cabinet + glass door`, per tier (Core = DL-WS, Slim = DL-SSA and DL-SSE, Luxe = DL-LUXE-TBD). Example: W1530GD Core = W1530 $88 + WG1530 $35 = **$123** (Luxe $176 + $70 = $246). Both source price rows are in each SQL row comment and in `dl_unmatched_glass_pricing.csv` (48 rows).
4. **Diagonal glass, confirmed by Tom**: WDCG243012 -> DCW2430GD, WDCG243612 -> DCW2436GD, WDCG244212 -> DCW2442GD, priced WDC243012/243612/244212 + the WDCG door (e.g. Core $211 + $45 = $256).
5. **12-wide glass, approved**: new hidden masters **W1230GD, W1236GD, W1242GD** (12 x 30/36/42 x 12, 1 door, 2/2/3 shelves from spec book p.4; alias WG1230/1236/1242). Priced W12xx + WG12xx. The NOT EXISTS guard on masterCode means that if a master already exists under that code, the insert is skipped and the SKUs attach to it.
6. **SP09 = SPB9** (trash can pull-out base): alias on the existing SPB9, no new master. *Note*: the master sheet words SPB9 as "9in Spice Base / Pull-Out", and the spec book SP09 is 9 x 34-1/2 x 24, 1 drawer, 3 shelves; the description may need a correction.
7. **BWBKT18 = BWB18**: alias on the existing BWB18, high.
8. **RH36 is a cabinet** (`isNotCabinet=FALSE`, like RHF30/RHF36). **Compared with RHF36** (36 W x 23.5 H x 8 D per Tom): DL RH36 is 36 x 36 x 24 (spec book p.7, Range Hood Cover). Height (36 vs 23.5) and depth (24 vs 8) do not match, so it is NOT aliased to RHF36 and stays a hidden new master.
9. **2DB33 = common B33** (Tom): the new-master block and the "unique" note are removed. Alias 2DB33 -> B33, with the DL SKU rows under B33 (match basis "Tom confirmed Oct 31, common B33"). **REVIEW**: DL's spec book p.2 lists 2DB33 as a Drawer Base with 0 doors and 2 drawers, DL's own B33 is 2 doors / 2 drawers / 1 shelf, and DL prices them differently (2DB33 Core $263 vs B33 $198). DL's B33 SKU already exists on this master, so this adds a second DL SKU to B33 (distinct platformSku `2DB33-WS-DL`, etc.; the one-SKU-per-cabinet guard is deliberately bypassed for this row only). If the spec book is right, B33 would carry a $263 option that is a different cabinet.
10. **SP2436 (a panel)**: spec-book lookup found NOTHING (text searched for `SP2436`, `SP 2436`, `2436`; only W2436 and WDC243612 contain the digits), so there is no description, dimensions, thickness, finish or page to match. The price list has only core $33 / slim $33 / luxe $66, no dimensions. No panel master can be matched without specs and none is created: report-only. Needs DL's description from Rich; then alias to the matching panel master.
11. **FLAT PANEL 28X96** (field cut): the spec book lists only FLAT PANEL 27X96 (3/4 thick, 96 high, 27 wide, finish not stated). No existing panel master matches (nearest 3/4in panels FPL2496 / FPL3796 are 96 x 24-3/8 / 37-3/8). Created a hidden new panel master: 28 x 96 x 3/4, category Panels / Flat Panel, `isNotCabinet=TRUE` (accessory pattern of the existing filler/panel masters), specNotes **"Field cut — panel is cut to fit on site by installer."** The 3/4 thickness is borrowed from the 27X96 row (assumption); finish is NULL. The SQL ends with a read-only SELECT of FPL3796 / SPW / IS3696 / FPV4296 to confirm their live `isNotCabinet`; change this master if they differ.
12. **QUARTER DOOR**: excluded, pending Rich.

## Other review items
W1218/W1518/W1818 match by identical code but the master description has no depth/shelves; WMC3018 -> PWB-MOS-30-18 differs by 1/8" depth (medium); CL156012 category "Tall" and knee-drawer / end-shelf subcategories are my classification. Mapped-master existence and the live `isNotCabinet` values could not be checked (live DB not queryable).

## Not known / left NULL (never guessed)
Door and drawer face sizes, construction method, materials, hardware, finish, packaging dims and weight, and photos are not in the spec book or price list for the new masters. Weight/cube and photo rules are recorded by reference in `dl_unmatched_specs.csv` (not implemented; held for Tom).

## Safety
New masters: `isActive=0, showInDesigner=0, showInCatalog=0`. All SKU rows: `isPublished=FALSE, status='pending'`. SQL is INSERT-only with NOT EXISTS guards, NOT RUN. `pnpm check`/vitest were not run (npm registry blocked); the test below was run with the local shim only.
