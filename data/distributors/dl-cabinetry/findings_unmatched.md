# DL unmatched SKUs: findings (90 items)

Rule applied (standing, all suppliers): nomenclature first -> find the master -> if none, create a NEW master whose code and alias is the supplier code. Masters were searched in `cabinet-descriptions-corrected-2026-10-26.xlsx` (the live DB was not queryable), so **every "matched" master must be confirmed in the live catalog before the SQL is run**. The 110 already-matched rows are unchanged (verified by the test).

| Result | Count | Where |
|---|---|---|
| Matched to an existing master | 19 | crosswalk + SQL (pending SKUs) |
| NEW master (unpublished) | 18 | SQL blocks 1-18, alias block 19, specs in `dl_unmatched_specs.csv` |
| Accessory / trim / glass door: report only | 50 | crosswalk `accessory-report`, no master created |
| Skipped (needs Tom or Rich) | 3 | QUARTER DOOR, SP2436, BWBKT18 |

Full per-item list with reasons: `dl_unmatched_report.csv` (also the `note` column of `dl_crosswalk.csv`).

## Flags for Tom
1. **FDB18-36 -> B##FH.** The spec book calls FDB "Full Height DOOR Base" (1 door for 18/21, 2 doors 24+), not "full-drawer base" as the brief said. Mapped to B18FH-B36FH, high. FDB09 has no master (nothing below B12FH) and is not in the spec book, so it is a new master from the price list only.
2. **Glass doors (WG1230-WG1842, WDCG*) are door-only parts** in the spec book (and the price list says "door only? unconfirmed"), not glass wall cabinets as classified in the brief. No masters created; please decide door accessory masters vs. the existing `W####GD` cabinets.
3. **SP09** is created new, but SPB9 (9" Spice Base / Pull-Out) may be the same item; its construction is not in the master sheet. Review for duplicate before publishing.
4. **BWBKT18** stays low-confidence (candidate BWB18) and is excluded from the SQL.
5. **QUARTER DOOR, SP2436, FLAT PANEL 28X96 (spec lists 27X96)**: not identifiable from the spec book; ask Rich.
6. W1218/W1518/W1818 match by identical code but the master description has no depth/shelves; WMC3018 -> PWB-MOS-30-18 differs by 1/8" depth (medium).
7. CL156012 category "Tall" and knee-drawer / end-shelf subcategories are my classification.

## Not known / left NULL (never guessed)
Door and drawer face sizes, construction method, materials, hardware, finish, packaging dims and weight, and photos are not in the spec book or price list for the new masters. Weight/cube and photo rules are recorded by reference in `dl_unmatched_specs.csv` (not implemented; held for Tom).

## Safety
New masters: `isActive=0, showInDesigner=0, showInCatalog=0`. All SKU rows: `isPublished=FALSE, status='pending'`. SQL is INSERT-only with NOT EXISTS guards, NOT RUN. `pnpm check`/vitest were not run (npm registry blocked); the test below was run with the local shim only.
