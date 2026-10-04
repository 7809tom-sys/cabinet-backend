# MasterTrac Closet palette — session checklist (2026-10-04)

- [x] Confirm source: uploaded `2022WoodTracProgramPrePaidPriceLists(WHOLESALE.xlsm`, `MasterTrac` worksheet, effective March 1, 2022.
- [x] Confirm price basis with owner: show **List (column E)** to customers, keep dealer **Invoice (column D)** out of the client bundle.
- [x] Source audit: 454 distinct numeric SKUs, all with positive List prices, 55 sold in packs; Invoice matches List × 0.51.
- [x] Generate auditable, public-list-only MasterTrac catalog data; do not include Invoice data, multiplier, original workbook, or other product lines in frontend assets.
- [x] Replace placeholder `CL-*` palette rows with actual MasterTrac SKUs and finish/category grouping; ensure non-placeable hardware is not draggable or automatically drawn as a cabinet.
- [x] Preserve previously saved `CL-*` placements without silently assigning a fabricated new price.
- [x] Verify SKU/count/price reconciliation, package pricing, browser placement/filtering, TypeScript, build, focused tests and overall regression baseline. The final full suite had 102 known failures versus 104 in the pre-MasterTrac baseline, with no new failure cases.
- [x] Save a managed webdev checkpoint only after verification. Do not assert that 2022 prices are currently valid or that there is a working checkout without proof.
