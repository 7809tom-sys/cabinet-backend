# DL unmatched SKUs: findings (90 items)

Rule applied (standing, all suppliers): nomenclature first -> find the master -> if none, create a NEW hidden master whose code and alias is the supplier code. **Tom's standing rule (Oct 31): anything unsure goes to the Cabinet Conflict tab** (existing mechanism, no new flag; see below). Unsure items still get a SKU. Masters were searched in `cabinet-descriptions-corrected-2026-10-26.xlsx` (the live DB was not queryable), so **every "mapped" master must be confirmed in the live catalog before the SQL is run**. The 110 already-matched rows are unchanged (verified by the test).

| Result | Count |
|---|---|
| Mapped to an existing master (exact / dimension / nomenclature) | 28 |
| Aliased onto an existing master (SP09 -> SPB9, BWBKT18 -> BWB18) | 2 |
| NEW hidden masters (incl. 2DB33, W1230GD/W1236GD/W1242GD, FLAT PANEL 28X96) | 21 |
| Report-only items, now each its own hidden master + pending SKU + **conflict entry** (38 accessory/trim/etc. incl. SP2436, plus QUARTER DOOR) | 39 |
| Skipped | 0 (nothing is skipped) |
| **Total** | **90** |

Every one of the 90 DL items gets a pending, unpublished SKU on each of DL-WS (Core), DL-SSA and DL-SSE (Slim), and DL-LUXE-TBD (Luxe): 90 rows per style. Full per-item list with reasons and sources: `dl_unmatched_report.csv` (also the `note` column of `dl_crosswalk.csv`).

## Cabinet Conflict entries (Tom's standing rule)
Mechanism used: `cabinets.conflictStatus` / `conflictReason` / `conflictedAt`, the same fields `catalog.setConflict` writes and the admin Cabinet Conflict (Conflicts) tab lists. `notInConflict()` already hides `conflict` rows from every public query; `review` rows stay public. Reasons use the existing `Issue / Current value / Source / Needed / Resolved fields` layout of `shared/cabinetConflictFlags.formatConflictReason`. List: `dl_unmatched_conflicts.csv`.
- **47 hidden masters flagged `conflict`**: the 39 report-only masters (reason = why unsure, source checked: spec book page or "NOT FOUND", price-list row, what an admin needs to confirm) and 8 new masters whose values are not fully sure (FDB09, CL156012, DSK2421, DSK3021, WEOS0930/36/42, FLAT PANEL 28X96).
- **5 existing shared masters flagged `review` (stay public)** for medium-confidence mappings: PWB-MOS-30-18 (WMC3018), TUK, SPRAYPAINT, SM8, REPV2796. The UPDATE only runs `WHERE conflictStatus = 'none'`, so it never overwrites an existing flag. This is the one place the SQL touches an existing row; delete those 5 blocks if you do not want existing masters touched.
- **SP2436** (probably a decorative door; Tom is fairly but not fully sure): own hidden master `SP2436` (Panels / Decorative Door, 24 x 36 read from the code, thickness unknown) + pending SKUs (Core $33, Slim $33, Luxe $66) + conflict entry **"Likely decorative door 24x36; not found in DL spec book; confirm."** Spec-book lookup (searched `SP2436`, `SP 2436`, `2436`): not found.
- **QUARTER DOOR**: own hidden master + pending SKU + conflict entry, pending Rich.

## Tom's decisions (all applied)
1. **FDB18-36 -> B18FH-B36FH**: unchanged. FDB09 is a hidden new master (price list only; flagged).
2. **Glass doors**: WG1530/1536/1542/1830/1836/1842 map to the existing W1530GD...W1842GD (a WG item is the glass DOOR only, not a cabinet).
3. **Glass pricing**: `listPrice = plain cabinet + glass door`, per tier, never the door alone. Example: W1530GD Core = W1530 $88 + WG1530 $35 = **$123** (Luxe $176 + $70 = $246). Both source rows are in each SQL row comment and in `dl_unmatched_glass_pricing.csv` (48 rows).
4. **Diagonal glass, confirmed by Tom**: WDCG243012 -> DCW2430GD, WDCG243612 -> DCW2436GD, WDCG244212 -> DCW2442GD, priced WDC243012/243612/244212 + the WDCG door.
5. **12-wide glass, approved**: new hidden masters W1230GD, W1236GD, W1242GD (alias WG1230/1236/1242), priced W12xx + WG12xx. If a master already exists under that code, the NOT EXISTS guard skips the insert and the SKUs attach to it.
6. **SP09 = SPB9**: SPB9 IS a 9in Spice Base / Pull-Out (Tom, 11:12 CT; the earlier trash-can wording was a misstatement and is removed from every note). Master description unchanged. SP09 stays an alias of SPB9 as a spice pull-out; no new master.
7. **BWBKT18 = BWB18**: alias on the existing BWB18, high.
8. **RH36 is a cabinet** (`isNotCabinet=FALSE`, like RHF30/RHF36). Compared with RHF36 (36 W x 23.5 H x 8 D per Tom): RH36 is 36 x 36 x 24 (spec book p.7), so height and depth do not match; hidden new master, not an alias.
9. **2DB33 FINAL (Tom, 11:11 CT): UNIQUE item, NOT B33.** The B33 alias and its DL SKUs under B33 are removed (never generated). 2DB33 is its own hidden new master: 33" two-drawer base, 33 x 34-1/2 x 24, 0 doors, 2 drawers (DL spec book p.2), at DL's own prices (Core $263, Slim $290, Luxe $526).
10. **SP2436**: see Cabinet Conflict above.
11. **FLAT PANEL 28X96** (field cut): hidden new panel master, 28 x 96 x 3/4, category Panels / Flat Panel, `isNotCabinet=TRUE`, specNotes "Field cut — panel is cut to fit on site by installer." Thickness borrowed from the spec book's FLAT PANEL 27X96 row (the 28 size is not in the spec book); finish unknown. Flagged in Cabinet Conflict.
12. **QUARTER DOOR**: pending Rich (hidden master + pending SKU + conflict entry, nothing skipped).

## Other review items
W1218/W1518/W1818 match by identical code but the master description has no depth/shelves; CL156012 category "Tall" and knee-drawer / end-shelf subcategories are my classification (flagged). Report-only masters use `constructionType` NULL and `isNotCabinet=TRUE` (accessory pattern); the SQL ends with a read-only SELECT of existing panel / hood masters to confirm their live flags. Mapped-master existence and live flags could not be checked (live DB not queryable).

## Not known / left NULL (never guessed)
Door and drawer face sizes, construction method, materials, hardware, finish, packaging dims and weight, and photos are not in the spec book or price list for the new masters. Weight/cube and photo rules are recorded by reference in `dl_unmatched_specs.csv` (not implemented; held for Tom).

## Safety
New masters: `isActive=0, showInDesigner=0, showInCatalog=0, showIn2020=0`. All SKU rows: `isPublished=FALSE, status='pending'`. SQL is INSERT-only except the 5 guarded `review` UPDATEs; NOT RUN. `pnpm check`/vitest were not run (npm registry blocked); the test was run with the local shim only.
