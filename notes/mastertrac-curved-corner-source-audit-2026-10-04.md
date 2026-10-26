# MasterTrac curved corner shelf — branch-only source audit (2026-10-04)

**Branch:** `test/mastertrac-curved-corner`, created at `bd8810a455`; the managed worktree subsequently fast-forwarded with unrelated upstream changes to `7330753934` before this audit was recorded. This is evidence gathering only: no corner-feature site source has been edited, and nothing from this branch is merged, checkpointed to main or published. The user requests a real placeable curved corner shelf at left/start and right/end of a two-bay tower, with shared upright, exact front elevation/3D, source SKU/finish/price in takeoff and cart, and screenshots **before** anything goes live. User forbids edits to the shared 3D Designer, Continuous Wall Builder and kitchen cabinet code.

## Authoritative March 1, 2022 catalog

Owner workbook: `/home/ubuntu/upload/2022WoodTracProgramPrePaidPriceLists(WHOLESALE.xlsm`, sheet `MasterTrac`, customer-visible List column E. Generated public-only equivalent: `client/src/lib/mastertrac-catalog.json`. Do not expose dealer Invoice column D. All rows below are each-priced, pack quantity 1. The workbook fields name a **29.5 × 0.75 × 29.5 in** bounding size; they do **not** give a radius, curve endpoints or plan-view polygon.

| SKU | Type | Finish | Source row | March 2022 List each |
| --- | --- | --- | ---: | ---: |
| 432556 | Fixed Corner Shelf | Glacier White | 57 | $46.00 |
| 432557 | Adjustable Corner Shelf | Glacier White | 58 | $38.00 |
| 432786 | Fixed Corner Shelf | Spiced Mahogany | 162 | $57.50 |
| 432787 | Adjustable Corner Shelf | Spiced Mahogany | 163 | $47.50 |
| 430833 | Fixed Corner Shelf | Slate Rift | 267 | $57.50 |
| 430834 | Adjustable Corner Shelf | Slate Rift | 268 | $47.50 |

## Manufacturer documents and conflicts

- [Sauder MasterTrac professional resources](https://sauder-closets.com/pro-resources) → **MasterTrac Installation Floor Mount 579554**, cover dated 03/21/22, **PDF page 5 (printed Page 5)**, illustrates the actual curved SKU families by number and finish, but states **“Actual 29¼ in × 29¼ in”**. This conflicts with the owner's price sheet and the sanitized SKU catalog at **29.5 × 29.5 in**; it likely reflects nominal versus physical size but no source here explicitly reconciles them. Its small isometric sketch shows a concave curved edge and possible notches, but **no dimensioned top view, radius, arc endpoints, straight-edge lengths or notch positions**.
- Same manual **PDF page 42**, H-Joint Channel Installation, shows a channel supporting **two fixed shelves that butt together**, at a notch. It does **not** specify a shared upright at a curved-shelf/straight-bay seam, the exact shelf-to-panel offset, or left/right hand/orientation. Do not substitute a guessed center panel or joint SKU for this connection.
- [2026 MasterTrac spec book](https://sauder-closets.com/pro-resources), **PDF page 13**, pictures a concave fixed and adjustable corner shelf and separately pictures a newer **90-degree corner shelf**. The 2026 table still describes a 29.5 × 0.75 × 29.5 in SKU box, but pack quantity 4 and finishes changed relative to the approved 2022 source. It provides no radius/notch/connection dimensions and must not replace the owner's 2022 assortment or prices.
- The owner's five-page `/home/ubuntu/upload/mastertrac.pdf` is a lifestyle brochure with ¾-in construction and three original finishes, not a measured product outline. A search for exact SKU `432556` with CAD/DXF/radius terms found no manufacturer dimensioned drawing; unrelated corner products must not be used.

## Exact information needed before accurate 2D/3D placement

1. A **dimensioned top-view outline or DXF** of 2022 curved corner shelf 432556/432557 (and confirmation the other finish SKUs share that geometry), showing **actual installed outer X/Y**, the concave **curve profile (radius/center and start/end coordinates, or dimensioned spline)**, all straight edge lengths, and any notch/chamfer dimensions. A photograph or unscaled isometric sketch does not establish these.
2. A **left/start and right/end assembly drawing** showing the shelf's orientation relative to the two room walls, the **offset to the first shared upright**, which floor-panel role/SKU forms the join to a straight bay, and whether a corner shelf can actually share that upright or needs the separately priced H-joint/channel/support. Without this, panel-to-shelf collision, cutaway and BOM would be invented.
3. Resolve the dimensional conflict: should the installed 2D/3D footprint use **29¼ × 29¼ in (2022 installation manual actual)** while the nominal stock catalog remains **29.5 × 29.5 in**, or is there a revised measured outer size for the specific 2022 SKU?
4. Cart pricing choice: March 2022 List is already approved **customer-visible reference pricing** but deliberately excluded from checkout throughout the current MasterTrac lane. The request for a corner shelf “in the cart” needs confirmation whether this means a **non-checkout reference cart/takeoff** or a **purchasable checkout line using a current verified sell price**. Do not silently treat historical List as today's sale price.

Until these are resolved, do not flip `placeable` on, change the 3D Designer or cart code, remove the honest unavailable message, or generate a fake corner-plus-two-bays screenshot.

## Owner's subsequent implementation decision (2026-10-04)

The owner explicitly approved the **29.5 × 29.5 in price-sheet footprint**, an **illustrative curved edge** with up-to-one-inch visual tolerance, and a separately listed **2022 H-joint channel**. The channel and curve are not installation drawings. Left/start and right/end corners may be placeable through the **Closet tower planner** with source SKUs and two or more shared-upright straight bays. Historical March 2022 List values belong in a **non-checkout reference cart/takeoff**, not the real cart/checkout; no current sell price was supplied. The owner's fixed/adjustable finish mapping is Glacier White 432556/432557, Spiced Mahogany 432786/432787 and Slate Rift 430833/430834.

The original blocker above applies only to claiming *manufacturing-accurate* geometry or a purchasable cart. The 2022 List source has one-each 14.5-in H-joint channels **433172 (White)** and **433176 (Brown)** at **$8.50 each**. It has **no Slate-finish one-each channel**: the planner must show a **White** channel as a visibly different sourced finish for Slate Rift fixed shelves rather than invent a Slate SKU. The manual's H-joint drawing supports **two fixed shelves that butt together**; for adjustable corner shelves no fixed-shelf H-joint is inferred or priced. The depicted position of the fixed join relative to the upright is still illustrative. Do not change the shared 3D Designer, kitchen cabinet geometry, Continuous Wall Builder, or real checkout eligibility.

## Branch-only implementation and verification

The isolated `test/mastertrac-curved-corner` branch adds a sourced corner mode to the Closet tower planner. Default fixed corners align at the adjacent bay's fixed-top elevation; the adjustable variant exposes its own elevation and intentionally has **no fixed-only H-joint line**. Left/start and right/end both lock to the selected wall endpoint. The 29.5-inch corner, two straight bays and three uprights (including one shared center panel) preflight as an atomic assembly, save/reopen with exact SKU identity, and remain excluded from checkout. The existing separate Designer cabinet/Wall Builder/InteractiveRoom3D modules were not edited. A dedicated Closet-only focused front elevation and Three.js view use the sourced bounding box, with an explicitly **illustrative curve and joint position**; if other design pieces exist they are disclosed as not shown in the focused view.

The Closet materials panel displays a **non-checkout reference cart** with shelf SKU, finish, March 2022 List and one-each channel SKU/actual channel finish/List when the fixed variant is selected. It keeps the normal checkout-ready total at $0. The six exact shelf cards open the corner tower planner in their matching finish/type rather than generic rectangular placement. The prior “not represented yet” message is removed only from this now-working corner path.

**Local production-preview proof only, not live deployment:** disposable QA draft `qa-corner-20261004@cabinetdealz.com` at `http://localhost:3420/design`, desktop 1512×940. Actual clicks placed a Spiced Mahogany left/start `432786` shelf + Brown `433176` channel ($57.50 + $8.50 List) with two 24-in straight bays, then edited the same group to right/end. Front elevation and 3D screenshots for both orientations are in `/home/ubuntu/mastertrac-corner-proof/`. One undo returned the left corner, one redo returned the right; reload retained right/end and the reference cart; no page JavaScript errors. The temporary static Vite preview does not serve the brochure `/manus-storage/` asset, so delivery crops show only the verified canvas and reference materials. No public site publication or main-branch merge was requested or performed.

TypeScript, focused tower/corner/cart/mesh tests (**43 passing across four files**) and production build passed. Before this feature the full Vitest suite had **103 failing tests**; afterward **104**. The one newly named case was an unrelated kitchen AI consultant request timing out under the 30-second suite limit; it **passed when rerun alone** (94-second remote response). Do not describe the full suite as green. No new Closet geometry, cart, or viewer test failed.

A separate browser pass searched and clicked **all six** corner shelf cards (432556, 432557, 432786, 432787, 430833, 430834); each was enabled and opened the tower planner with its real finish and fixed/adjustable type. No other formerly non-placeable MasterTrac category was enabled.
