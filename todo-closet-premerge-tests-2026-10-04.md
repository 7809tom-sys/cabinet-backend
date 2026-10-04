# Cabinet Dealz Closet pre-merge test triage — 2026-10-04

Branch: `test/mastertrac-closet-workspace`. Do not merge, push or publish during this triage. All browser proof below is from a **local built preview**, not `www.cabinetdealz.com`.

## Full-suite triage

- [x] Rerun `npx vitest run` from clean Closet workspace commit `16d3c83b0a` and preserve the failure manifest. That branch baseline had **104 failed** named tests.
- [x] Compare error signatures with the previous pre-Closet baseline (103 failed); do not change product behavior just to make stale source assertions green.
- [x] Repair two safe test-fixture roots: a jsdom-only `matchMedia` shim for the mounting dialog and explicit bar-pull hardware in 3D tests that physically expect pulls. The intervening full suite fell to **82 failed, 4,431 passed, 3 skipped** with no new named failures versus the 104-case rerun. Logs/manifests are in `/tmp/closet_premerge_after_fixtures.log` and `/tmp/closet_premerge_after_failures.txt`.
- [x] Revalidate final code: `npx tsc --noEmit` passes; focused dialog/3D/tower/corner suite passes **403, 2 skipped**; all five responsive release test files pass **32**; `pnpm build` passes.
- [x] Rerun the entire suite after the tablet drawer edits. Pre-motion result: **84 failed, 4,430 passed, 3 skipped** across 4,517 cases. The 82 prior named failures remained. Two additional unrelated server test names appeared: a remote AI consultant request timed out at 30 seconds; `design.placeableCabinets` selected-door-style availability test fails on mismatched live catalog SKU availability and also fails in isolation. The latter is a separate DB/catalog assumption to investigate; do not relax the price or availability gates or change the kitchen catalog during this Closet tablet task. The log is `/tmp/closet_tablet_full_drawer_final.log`, normalized manifest `/tmp/closet_tablet_full_drawer_final_failures.txt`.
- [ ] Resolve independently verified remaining baseline failures in separately scoped work before considering merge approval. The full suite is **not green**.

## Tablet screenshot follow-up

- [x] Identify the selected MasterTrac board beside an irrelevant kitchen door sample, a large bottom 3D inspector, and a misleading `$0.00` toolbar checkout total.
- [x] In Closet mode, hide the kitchen cabinet/door sample on a selected MasterTrac board, label the catalog action `Add closet parts`, and show the **March 2022 List reference subtotal** instead of the checkout price. Ordinary kitchen labels and cart behavior remain in source; checkout code is untouched.
- [x] Start a selected MasterTrac board's 3D dock compact in the existing **1024–1366 CSS px** tablet tier. Keep an accessible `Details` expander and `Attributes` dialog. Ordinary kitchen selection starts expanded.
- [x] Verify in a local production build at **1280 × 800** with a QA-only localStorage draft: select real board **432527**; after adding it, the toolbar shows **`2022 List · reference $104.00`**; no kitchen door sample appears; the compact 3D dock shows the exact board and `Details`; Details opens the full dock; `Attributes` shows shelf elevation; zero JavaScript page exceptions. The dated amount is a **non-checkout reference**, not a live offer.
- [x] The later live-site screenshot shows that the open catalog's large brochure and kitchen distributor filter push MasterTrac part cards below the tablet fold. In the branch-only preview at **1280 × 720**, the brochure and long notes now start collapsed behind an accessible `About` disclosure; the historical reference warning remains visible; the kitchen distributor row is removed from tablet Closet parts but returns on Kitchen. First real part card begins at **y=426.25 px**, with multiple cards visible. About restores the brochure and complete notes. Zero JavaScript page exceptions. Screenshots are outside the repo at `/home/ubuntu/closet-tablet-proof/`.

## About motion follow-up

The tablet-only About disclosure now uses an interruptible **220 ms** grid-track transition for the brochure and full notes, with an arrow rotation. The collapsed panel remains `inert` and `aria-hidden`; the visible March 2022 List warning remains outside it. `prefers-reduced-motion: reduce` disables the transition. Keyboard Space and rapid reversal were verified in the local production preview at **1280 × 720** with zero page exceptions. Fresh TypeScript and production build passed; all **32** responsive checks and **412** focused tests passed (**2 skipped**). The post-motion full suite has **81 failed, 4,446 passed, 3 skipped** across 4,530 cases, still **not green**. Normalized comparison against the prior 84-case run shows **zero newly failing named tests** and three old names absent on this rerun; do not attribute the unrelated changes to the animation. Log: `/tmp/closet_about_full_suite.log`; manifest: `/tmp/closet_about_full_failures.txt`.

**Branch boundary:** Keep the verified patch and managed checkpoint on `test/mastertrac-closet-workspace`. No merge, push or production deployment is part of this handoff.
