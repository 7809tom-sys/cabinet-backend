# DL unmatched SKUs: findings (90 items)

Rule applied (standing, all suppliers): nomenclature first -> find the master -> if none, create a NEW master whose code and alias is the supplier code. Masters were searched in `cabinet-descriptions-corrected-2026-10-26.xlsx` (the live DB was not queryable), so **every "matched" master must be confirmed in the live catalog before the SQL is run**. The 110 already-matched rows are unchanged (verified by the test).

| Result | Count | Where |
|---|---|---|
| Matched to an existing master | 30 | crosswalk + SQL (pending SKUs) |
| NEW master (unpublished) | 17 | SQL blocks 1-17, alias block 18, specs in `dl_unmatched_specs.csv` |
| Accessory / trim / no-master: report only | 41 | crosswalk `accessory-report`, no master created |
| Skipped (open question for Rich) | 2 | QUARTER DOOR, SP2436 |

Full per-item list with reasons: `dl_unmatched_report.csv` (also the `note` column of `dl_crosswalk.csv`).

## Tom's decisions (applied in the second commit)
1. **FDB18-36 -> B18FH-B36FH**: kept as is. FDB09 remains a new master (price list only).
2. **Glass doors -> existing glass door cabinets** ("it's just a glass door, not a cabinet"). WG1530/1536/1542/1830/1836/1842 map to W1530GD...W1842GD. WDCG243012/243612/244212 map to the diagonal-corner glass cabinets DCW2430GD/2436GD/2442GD (medium: Tom named W####GD; DCW####GD is my extension, please confirm). **WG1230, WG1236, WG1242 have NO master** (no 12-wide W12{30,36,42}GD exists; 12-wide glass cabinets exist only at 12 high), so they are listed in the report and no master was created. Pending SKU rows are on the mapped masters only.
3. **SP09 = SPB9** (splice pull-outs). New-master block removed; alias SP09 -> SPB9 plus pending DL SKU rows on SPB9. **Duplicate resolved this way**: SPB9 is the master that the first draft flagged.
4. **BWBKT18 = BWB18**: now a confirmed (high) match; alias BWBKT18 -> BWB18 plus pending SKU rows.
5. **RH36 (range hood)**: modeled like the existing hood masters. In the repo, RHF30/RHF36 are cataloged as cabinets (Wall / Range Hood Front, drawn as wall-cabinet hood fronts; the `HOOD-*` appliance hoods are palette items, not cabinet masters), so RH36 uses category Wall / Range Hood Front and `isNotCabinet = FALSE`. The live flag values could not be queried: the SQL ends with a read-only SELECT of RHF30/RHF36/HOOD-30/HOOD-36/RH36 to confirm; if RHF shows isNotCabinet = 1, change RH36 to match before running. RH36 is hidden anyway (isActive=0, showInDesigner=0).
6. **2DB33 checked**: no 2-drawer 33" base exists under any code or alias (B33 = 2 door 2 drawer; 3DB33 = 3 drawer; ADA-B33 is ADA; 2-drawer bases exist at 24/30/36 only). Kept as a new master. Based on the Oct 26 sheet, not the live DB.

## Still open (excluded; questions for Rich)
QUARTER DOOR, SP2436, FLAT PANEL 28X96 (spec book lists 27X96). Also: W1218/W1518/W1818 match by identical code but the master description has no depth/shelves; WMC3018 -> PWB-MOS-30-18 differs by 1/8" depth (medium); CL156012 category "Tall" and knee-drawer / end-shelf subcategories are my classification.

## Not known / left NULL (never guessed)
Door and drawer face sizes, construction method, materials, hardware, finish, packaging dims and weight, and photos are not in the spec book or price list for the new masters. Weight/cube and photo rules are recorded by reference in `dl_unmatched_specs.csv` (not implemented; held for Tom).

## Safety
New masters: `isActive=0, showInDesigner=0, showInCatalog=0`. All SKU rows: `isPublished=FALSE, status='pending'`. SQL is INSERT-only with NOT EXISTS guards, NOT RUN. `pnpm check`/vitest were not run (npm registry blocked); the test below was run with the local shim only.
