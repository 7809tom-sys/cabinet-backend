# Designer fixes — working notes (this session)

## 1. Elevation wall-assignment fix (DONE, tested)
- File: `client/src/lib/design.ts` -> `cabinetWall()` rewritten ORIENTATION-FIRST.
  - rot 0/180 (horizontal) => top/bottom; rot 90/270 (vertical) => left/right; proximity only breaks tie within the oriented pair.
  - Fixes corner cabinets (flush to two walls) being drawn on the wrong elevation (e.g. left-wall range showing on Front view).
- Tests added in `client/src/lib/design.test.ts` (cabinetWall inference describe block): corner cases in all 4 corners, both orientations.
- Updated stale fixture in `autoPlaceRangeFillers` test: r2/b2 now b2 at y=25 (rot90 rotatedSize.d = width). Need to re-run `pnpm vitest run client/src/lib/design.test.ts` to confirm 280 pass.

## 2. Manual filler placement (APPROVED, NOT YET DONE)
- User: "we will decide where a filler goes" + confirmed keep WARNING, stop auto-insert.
- `addClearanceFiller` (DesignTool.tsx ~line 1869) is button-triggered only (not auto). Plan: remove the "Add clearance filler" button (DesignTool.tsx ~5006-5015) but KEEP the warning text (~4984). Keep `rangeOvenClearanceViolations`. Can drop `autoPlaceRangeFillers` usage/import.

## 3. Nimbus White missing W-30-12 / W-30-15 (ON HOLD - user checking spreadsheet)
- Nimbus White = styleId 30044, distributorId 1 (US Cabinet Depot / Madison Series), distName "Shaker Dove".
- Cabinets exist: W-30-12 = cabinetId 299, W-30-15 = cabinetId 302 (both Wall, active, showInDesigner=1).
- NO distributor_skus for plain W-30-12 / W-30-15 for ANY distributor-1 (USCD) style. Only "-24" deep + "GD" glass variants exist for USCD.
- dist 2 & 3 have 87 rows of W-30-12/15 (priced). So gap is USCD-only.
- Must NOT invent prices. User checking source spreadsheet to confirm whether USCD offers these.

## 4. Empty-line guard: don't publish styles with no available cabinets (IN PROGRESS)
- User request: "double check lines of cabinets if nothing is available dont publish" + "correct".
- Audit: only ONE active style has 0 available published SKUs: **Villa Blanc** styleId 120001, distributor 2 (Ashford). All others have 5+.
- Public list procedure: `server/routers/catalog.ts` `doorStylesRouter.list` (line 73) filters ONLY `isActive = true`. Does NOT check SKU availability.
- Plan: exclude styles with zero published+available SKUs (on active + showInDesigner cabinets) from PUBLIC list (both branches: with/without distributorId). Keep them in admin. Add DB helper + unit test.
- Also consider `byId` / `byCode` and the grouping/picker feed (trpc.distributors.list uses resolvePresentation) — but empty styles are the target; empty DISTRIBUTOR lines would also drop out of the picker automatically once their styles are filtered.
