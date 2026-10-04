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
