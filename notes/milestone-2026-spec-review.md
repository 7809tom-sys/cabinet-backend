# Milestone Cabinetry 2026 catalog review

**Source:** `/home/ubuntu/upload/7fcffbe4f8(1).pdf`, pages 4–7 visually reviewed on 2026-09-21; full text extraction at `/tmp/text_editor_extracts/7fcffbe4f8(1)-337258df2375-p1-20.txt`.

## Framed single-package collections (source page 4)

| Collection | Codes and finish names |
| --- | --- |
| Essential | SW — Shaker White; GR — Gray Shaker; SE — Shaker Espresso |
| Classic (drop-ship) | AC — Aspen Charcoal; AW — Aspen White; CW — Charleston White |
| Slim Shaker | SDW — Slim Dove White; SWO — Slim White Oak |
| Charm | NB — Navy Blue |

## Framed two-package / universal box collections (source pages 6–7)

| Collection | Codes and finish names |
| --- | --- |
| Charm | RW — Rustic Wood; SB — Sage Breeze; LG — Lunar Gray; AG — Aston Green; SA — Smokey Gray; TC — Treasure Chest; IB — Iron Black |
| Slim Shaker | SAO — Slim Amber Oak; SIB — Slim Iron Black; SAG — Slim Aston Green |
| Double Shaker | DDW — Double Dove White; DSG — Double Smokey Gray |

## Framed construction requirements

Premium Grade applies to Essential and Classic: 1/2-inch cabinet-grade plywood box; solid-wood dovetail drawer box, 2 1/2-inch depth; concealed under-mount, full-extension soft-close glides; clear UV-coated natural plywood interior; matching-color exterior; 3/4-inch solid-wood painted face frame; full-overlay five-piece solid-wood/MDF center-panel doors and drawers; six-way adjustable soft-close hinges; 3/4-inch shelves with edge banding; one package; TSCA VI, KCMA, CARB2, NGBS Green listed.

Universal Box applies to Charm, Double Shaker, and Slim Shaker: 1/2-inch cabinet-grade plywood box; solid-wood dovetail drawer box, 3 1/8-inch depth; concealed under-mount, full-extension soft-close glides; clear UV-coated natural plywood interior and exterior; 3/4-inch solid-wood frame; same full-overlay five-piece door/drawer construction; 3/4-inch shelves with edge banding; two packages (universal box and front set); TSCA VI, KCMA, CARB2, NGBS Green listed. The source highlights an open question to add BSV/WSV/USV for exposed-part finish; do not infer an unsupported matching-finish claim.

## Catalog SKU notes from extracted pages 7–10

The framed selection includes wall, glass-door, diagonal wall, base, drawer-base, blind corner, sink base, base end corner, farm sink, vanity, accessory, skin/panel, and rollout-shelf families. Explicit extracted specs include framed BSV 23 1/4 × 34 1/2 × 1/4; USV2496 23 1/4 × 96 × 1/4; FPV4296 42 × 96 × 1/4; S2496 24 × 96 × 3/4; WSV24/30/36/42 at 15 × coded height × 1/4; DWR3 24 × 34 1/2 × 3/4; REPV2496 24 × 96 × 1/2; and REPV2796 27 × 96 × 1/2. Further SKU and category specifics require mapping against current database records before mutation.

## Frameless facts in text extraction

Frameless collection codes are OB Oak Blonde, OS Oak Shade, MB Matte Black, MI Matte Ivory, CG Crystal Glass, MG Midnight Glass, HW High Glossy White, and HG High Glossy Gray. Construction: frameless, 3/4-inch plywood box/shelves, white melamine interior/exterior, PET high-gloss slab fronts, concealed under-mount full-extension soft-close glides, six-way soft-close hinges, two packages, TSCA VI/KCMA/CARB2/NGBS Green.

This note preserves visual findings before subsequent document/database review.

## Visual confirmation

Pages 4–7 were visually checked after text extraction. The finish-code/collection grouping and two construction classifications above match the source layout. No individual price, product availability, or per-SKU style mapping is stated in those pages, so these facts must not be used to create new sellable distributor rows without an approved price source.

## Catalog audit findings (read-only database query, 2026-09-21)

Madison is the current distributor record corresponding to the Milestone source. It has 24 active/current door-style records, source-list retail pricing, and an explicit separate-glass policy. The PDF does **not** contain price data, so no pricing or SKU availability may be altered from this document alone.

The master-SKU program already resolves approved punctuation variants such as `3-DB24 → 3DB24`, `B-24 → B24`, `SB-36 → SB36`, `FSB-36 → FSB36`, `U189624 → U-18-96-24`, and `WSV24 → WSV-24`. The canonical records must retain the existing approved aliases; do not create another master SKU for a formatting variant.

The source exposes four correctable master-record omissions:

| Canonical master SKU | PDF dimension truth | Current deficiency |
| --- | --- | --- |
| `FPV4296` | 42 W × 96 H × 1/4 D | Depth is missing; source page 9 states 1/4 in. |
| `S2496` | 24 W × 96 H × 3/4 D | Depth is missing; source page 9 states 3/4 in. |
| `USV2496` | 23 1/4 W × 96 H × 1/4 D | Width and depth are missing; source page 9 states both. |
| `WSV-24/30/36/42` | 15 W × coded height × 1/4 D | Dimensions are already correct, but source-backed detailed specification notes are absent. |

A further material defect found by audit: canonical `3DB24` has a `height` value of **30 in.**, while its existing product notes and standard framed catalog convention say 34 1/2 in.; its inactive alias `3-DB24` already carries 34 1/2 in. The frame/base SKU selection visual on source page 8 confirms `3DB24` is a standard base family. The correction is limited to the canonical master, not pricing or supplier rows.

Page 8 visually confirms the framed SKU assortment, including `3DB24`, `SB36`, `FSB36`, `ERB36`, `BBC36/39/42`, `BEC24`, and panels/skins. Page 9 visually confirms panel dimensions stated above. Page 10 confirms the frameless finish-code list; page 11 confirms its construction, and page 12 confirms a separate frameless SKU assortment. The source gives no per-finish price, availability, or importer mapping, so those are intentionally left unchanged.
