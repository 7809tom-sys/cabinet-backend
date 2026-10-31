# DL unmatched SKUs: findings (90 items)

Standing rules (all suppliers; all in `data/distributors/SUPPLIER_ONBOARDING.md`): **A** no skipping, **B** no price changes, **C** unique or unsure = Cabinet Conflict, created automatically by the generator, **D** naming (master = uniform nomenclature; the distributor's own description/dims/spec page on its SKU), **E** never cross-link unique items, **F** everything is published (unsure items are published AND flagged), **G** a new master is never created without being published with its SKUs, **H** never delete a master or alias automatically (no DELETE; tested), **I** new masters keep DL's nominal W/H/D. Nothing is merged, no SQL was run, nothing is published. Publishing exists only as the final, labeled **PUBLISH SECTION** of the SQL file (Tom runs it by hand). Masters were searched in `cabinet-descriptions-corrected-2026-10-26.xlsx` (the live DB was not queryable), so **every mapped master must be confirmed in the live catalog before the SQL is run**. The 110 already-matched rows are unchanged (verified by the test).

| Result | Count |
|---|---|
| Mapped to an existing master (exact / dimension / nomenclature) | 28 |
| Aliased onto an existing master (SP09 -> SPB9, BWBKT18 -> BWB18, RH36 -> RHF36) | 3 |
| NEW hidden masters (incl. 2DB33, W1230GD/W1236GD/W1242GD, FLAT PANEL 28X96) | 20 |
| Previously "report-only", now each a hidden master + pending SKU + Cabinet Conflict entry (38 incl. SP2436, plus QUARTER DOOR) | 39 |
| Skipped | **0** |
| **Total** | **90** |

**Cabinet Conflict entries: 89, created automatically by the generator** (rule C; the rule is `onboardingConflictLevel()` in `shared/onboardingConflicts.ts`, mirrored by `build_unmatched.py` and checked over all 200 DL crosswalk rows by `server/dlUnmatchedMasters.test.ts`): 59 on this PR's new masters (the 20 new masters are unique to DL by definition, plus the 39 previously report-only items) and 30 on existing shared masters that received a MEDIUM-confidence DL mapping (29 from the crosswalk, including PWB-MOS-30-18, plus RHF36 for the range-hood number conflict). Status is `review` (the existing public status: the row stays usable and is listed in Admin > Cabinet Conflict), because rule F says nothing stays hidden as a final state. The existing-master entries are `UPDATE ... WHERE conflictStatus = 'none'`, so an existing flag is never overwritten. List: `dl_unmatched_conflicts.csv`. Every one of the 90 DL items gets a pending SKU on each of DL-WS (Core), DL-SSA and DL-SSE (Slim) and DL-LUXE-TBD (Luxe): 90 rows per style, each at DL's own price-list price.

**PUBLISH SECTION (final blocks 97-102 of the SQL, Tom runs by hand).** (1) four blocks, one per door style, set this PR's 360 DL SKUs to `status='approved', isPublished=TRUE`, scoped to `distributorId = 450001` and this PR's `platformSku` list only; (2) one block sets this PR's 59 new masters to `isActive, showInDesigner, showInCatalog, showIn2020 = TRUE`; (3) a read-only check. Confirm before running that none of the 59 codes existed before this PR (a retired master with the same code would be re-activated). Flagged items stay flagged after publishing.

- **SP2436** (probably a decorative door; Tom is fairly but not fully sure; not in the spec book): own master (Panels / Decorative Door, 24 x 36 read from the code) + pending SKUs ($33 / $33 / $66) + conflict entry **"Likely decorative door 24x36; not found in DL spec book; confirm."**
- **QUARTER DOOR**: spec-book lookup (QUARTER DOOR / quarter / 1/4 door): not found -> own master + pending SKU + conflict entry.

## Range Hoods (review all together)
Decision: **RH36 is the same item as RHF36** (Tom). No separate RH36 master. Alias `RH36 -> RHF36`, DL SKUs under RHF36 at DL's own prices (Core $543 / Slim $543 / Luxe $1085). RHF36 is a cabinet (`isNotCabinet=FALSE`; the read-only SELECT in the SQL confirms the live flags before you run anything). RHF36 carries a `review` entry in Cabinet Conflict (stays public) listing each supplier's numbers.

| Code | Supplier | Dims W x H x D | Price | isNotCabinet | Source | Decision |
|---|---|---|---|---|---|---|
| RH36 | DL | 36 x 36 x 24, 0 doors, 0 shelves | Core $543, Slim $543, Luxe $1085 | n/a (alias) | DL spec book p.7 "Range Hood Cover"; price list P5 | Alias of RHF36; DL SKUs under RHF36; DL specs on the DL SKU |
| RHF36 | Faircrest/Ashford (CS) | 36 x 23.5 x 12 (catalog doc); Tom quotes 23.5 H x 8 D | not in repo (live DB) | FALSE (cataloged as a cabinet; live flag unverified) | docs/proofs/rhf-catalog-form-proof.md; notes/dn_resolved.json "36 x 23.5 Range Hood Fronts"; master sheet (no dims) | Master for the shared item; `review` flag; receives alias + DL SKUs |
| RHF30 | Faircrest/Ashford (CS) | 30 x 23.5 x 9 | not in repo | FALSE (same) | same docs | No change; listed for the naming decision |
| HOOD-30, HOOD-36 | Designer palette (client/src/lib/design.ts) | stainless appliance hoods, 18 deep | n/a | not cabinet masters | design.ts | Not related to RH36; no action |
| RH-15-42, RHC-06-30 | Skyline audit (scripts/skyline-audit.md) | 15 x 42 x 12 / 6 x 42 x 12 "Wall" | n/a | unknown | codes start RH, descriptions are plain wall cabinets, "NO MATCH" | Not verified as hoods; listed only |

**Spec placement (rule D).** DL's own numbers (36 x 36 x 24), source page (7) and description go on the DL SKU through existing columns: `distributor_skus.geometryWidth/Height/Depth`, `geometrySourcePage`, `geometryStatus = 'held'`, `supplierCabinetName`. Faircrest's 36 x 23.5 x 12 stay on theirs. **No migration is added.** What is still needed for Tom: (1) the DL spec **image** for RH36 has to be cut from the PDF and stored; the existing home is `distributor_cabinet_overrides.imageUrl` (per distributor + cabinet; I had no storage credentials, so nothing was uploaded). (2) Faircrest's own geometry on its RHF36 SKU rows could not be checked (live DB).

**Uniform name.** Tom wants "Range Hood <W> by <H>" (he said "30 by 36"). Verified numbers: DL 36 by 36; Faircrest/Ashford RHF36 36 by 23.5 and RHF30 30 by 23.5. They disagree on height (36 vs 23.5) and none is "30 by 36". Spec books / price sheets of the other suppliers (Clark & Son, US Cabinet Depot) are not in the repo; only the master sheet and the catalog docs above were available. So I did **not** rename anything: no rename UPDATE block exists, and the disagreement is flagged in Cabinet Conflict on RHF36 with each supplier's numbers. Tom to decide.

## Tom's decisions (all applied)
1. **FDB18-36 -> B18FH-B36FH**: unchanged. FDB09 is a hidden new master (price list only; flagged).
2. **Glass doors**: WG1530/1536/1542/1830/1836/1842 map to the existing W1530GD...W1842GD, **at DL's listed price as-is** (e.g. WG1530 Core $35). The earlier "cabinet + door" pricing and `dl_unmatched_glass_pricing.csv` are removed.
3. **WDCG243012/243612/244212 -> DCW2430GD/2436GD/2442GD**: confirmed by Tom; DL price as-is.
4. **WG1230/1236/1242 -> new hidden masters W1230GD/W1236GD/W1242GD** (alias WG12xx; if a master already exists the NOT EXISTS guard attaches the SKUs to it).
5. **SP09 -> alias of SPB9** (9in Spice Base / Pull-Out; description unchanged; no "trash can" wording anywhere).
6. **BWBKT18 -> alias of BWB18**, high.
7. **2DB33 is UNIQUE**: its own hidden new master, 33 x 34-1/2 x 24, 0 doors, 2 drawers (DL spec book p.2), DL prices (Core $263). It is never linked, aliased, substituted or cross-referenced to any regular base cabinet; a test asserts this.
8. **SP2436**: probably a decorative door. Own hidden master (Panels / Decorative Door, 24 x 36 read from the code) + pending SKUs + conflict "Likely decorative door 24x36; not found in DL spec book; confirm." Spec-book lookup: not found.
9. **FLAT PANEL 28X96**: hidden panel master 28 x 96 x 3/4, `isNotCabinet=TRUE`, note "Field cut — panel is cut to fit on site by installer." Conflict flags: the 3/4in thickness is taken from the FLAT PANEL 27X96 row (spec book p.13), and the finish is null.
10. **QUARTER DOOR**: not waiting on Rich. Spec-book lookup (QUARTER DOOR / quarter / 1/4 door): not found. Hidden master + pending SKU + conflict entry.
11. **All other report-only items**: decided per rules A and C: each is a hidden master (DL code = master code and alias) with a pending SKU and a conflict entry stating the spec-book page or "NOT FOUND" and the price-list row. Nothing is left report-only.

## The five medium-confidence masters (Tom, 11:17 CT)
- **TUK (TOUCHUP KIT), SPRAYPAINT (PAINT), SM8 (SCRIBEMOLDING)**: confirmed by Tom, raised to **high**; review blocks dropped.
- **REPV2796 (RRP27(1.5))**: verified in the DL spec book p.13 (Refrigerator Panel): "(1.5)" is the 1-1/2in panel thickness; the panel is 96 high x 27 deep, which matches REPV2796 (27D x 96H). The master records no thickness, so thickness is not compared. Raised to **high**; review block dropped.
- **PWB-MOS-30-18 (WMC3018)**: kept `review`. DL spec book p.8: WMC3018 = 30W x 18H x 12D, 0 doors, 1 shelf (open) -> confirmed a wall microwave shelf cabinet 30 x 18. The master is "30 x 18 x 11 7/8 Wall Microwave Open Box" (SK), depth 1/8in off. **What "PWB" stands for is not documented in any source I have.** Two closer matches exist in the same master sheet, exactly 12 deep: WMS3018 (USCD, wall microwave cabinet kit with a 26-1/2 x 3/4 x 17 shelf insert) and WOC3018 (USCD, wall microwave cabinet kit 30W x 18H x 12D). The flag lists all three for an admin to pick.

## Other notes
- **Master dimensions (rules D and I).** Tom's answer: new masters keep DL's nominal W/H/D. DL's own description, dimensions and spec page also sit on the DL SKU (`supplierCabinetName`, `geometry*`), so a second supplier mapping to the same master keeps its own numbers on its SKU.
- Report-only masters use `constructionType` NULL and `isNotCabinet=TRUE` (accessory pattern); the SQL ends with a read-only SELECT of existing panel / hood masters to confirm their live flags.
- W1218/W1518/W1818 match by identical code but the master description has no depth/shelves; CL156012 category "Tall" and knee-drawer / end-shelf subcategories are my classification (flagged).
- Not known / left NULL (never guessed): door and drawer face sizes, construction, materials, hardware, finish, packaging dims and weight, photos. Weight/cube and photo rules are recorded by reference in `dl_unmatched_specs.csv` (not implemented; held for Tom).

## Safety
INSERT blocks: new masters `isActive=0, showInDesigner=0, showInCatalog=0, showIn2020=0`, all SKUs `isPublished=FALSE, status='pending'`, every INSERT guarded with NOT EXISTS. The only statements that publish are the 5 UPDATEs in the final PUBLISH SECTION; the only other UPDATEs are the 30 guarded `review` flags. **No DELETE anywhere** (rule H; a test asserts it for every SQL file and script in this PR). FLAT PANEL 28X96: the 3/4in thickness is taken from the 27X96 row and flagged, and the finish is null; the 1.5in applies to REPV2796, not to this panel. `pnpm check`/vitest were not run (npm registry blocked); the test was run with the local shim only. SQL NOT run.
