# Designer Responsive Release Check

Every Designer, catalog, pricing, or operations release must preserve the same actionable design controls on **phone, tablet, and desktop**. The production build runs `pnpm run test:designer-responsive` automatically. That gate verifies the direct control routes and responsive editor contracts; it does not substitute for visual review.

Before a release is checkpointed, capture the Designer at the following viewports and inspect the visible result:

| Device class | Viewport | Required visual checks |
|---|---:|---|
| Phone | 375 × 812 | The bottom-bar **Attributes** command is touch reachable and opens the full editor for a selected cabinet, window, wall, or island. Catalog, price/cart, materials, surfaces, and the 2D/3D switch remain reachable without horizontal page scrolling. |
| Tablet | 1280 × 800 | Focus-canvas mode keeps the drawing usable while **Show panels**, Catalog, Materials & Parts, Surfaces, Price & cart, wall selection, view selection, Move, and selected-cabinet **Attributes** remain visible or one touch away. |
| Wide touch tablet / desktop | 1600 × 900 | A selected cabinet retains an explicit **Attributes** command without relying on right-click. The Catalog and price panels may be visible, but they must not cover the Plan/3D work area or hide the selected item controls. |

The reviewer must also place or select the same representative cabinet in Plan and 3D. Its full Attributes editor must report the same exact wall position, dimensions, corner clearance, and applicable movement/lock status. Continuous-wall and standard-room placement must retain the same collision and snap protections at all three viewport classes.

A release is not ready if any control exists only in a desktop right-click menu, is visually obscured by a drawer or panel, causes page-level horizontal scrolling, or edits a reduced data set on phone/tablet. The review record should name the viewport, the selected object, and any affected control before publication.
