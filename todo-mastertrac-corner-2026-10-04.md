# MasterTrac curved-corner branch-only checklist — 2026-10-04

- [x] Source audit: 2022 fixed corner shelf SKUs/finishes/List values and one-each 14.5-inch H-joint SKUs; 2022 manual curve sketch; owner authorized the 29.5 × 29.5-in price-sheet footprint and illustrative curve/join.
- [x] Create `test/mastertrac-curved-corner` branch; no merge, checkpoint to main, or live publish.
- [x] Establish untouched branch's 103-failure full-suite baseline and locate a Closet-only 3D/elevation seam without editing shared 3D Designer, Continuous Wall Builder or kitchen cabinet code.
- [x] Plan left/start and right/end corner+two-bay groups atomically; use actual 2022 SKU/finish/List and separately priced fixed H-joint; exclude checkout.
- [x] Persist/reopen corner mode and render an explicitly illustrative curved board in the Closet-specific front elevation and 3D view.
- [x] Show corner and H-joint quantity, SKU, finish and March 2022 List in a non-checkout reference cart/takeoff; remove the stale unavailable text after placement works.
- [x] Verify TypeScript, 43 focused passes and production build. Full suite: 104 failures versus 103 before; one new unrelated kitchen AI remote timeout passed alone after 94 seconds. Run isolated browser test for left/right corner, edit/undo/redo/reload.
- [x] Capture and inspect **branch-only local-preview** elevation and 3D screenshots for both ends; keep screenshots outside the repository and do not publish before owner review.
- [x] Commit only scoped Closet files and proof notes on `test/mastertrac-curved-corner`; do not merge or publish.
