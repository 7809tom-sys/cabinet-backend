# Supplier onboarding: supplier.json (every supplier)

Each supplier folder, `data/distributors/<supplier>/`, has a `supplier.json` so anyone can see where the data came from. DL Cabinetry is first; KitchenCraft and every future supplier follow the same shape.

Required fields (use `null` and a note for anything not known yet, never a guess):
- `name`, `code`, `status`
- `website`: `url`, `source`
- `specBook`: `title`, `version`, `url`, `savedFilename` (the PDF saved in the folder; `null` plus `savedFilenameNote` until it is), `source`
- `freightOrigins`: `warehouseZips` (first ZIP is the fallback), `order` (how the origin is chosen), `warehouses` (zip, place, address), `source`
- `contactAndOrdering`: `contact`, `ordering`, `freight`, `source`
- A `source` (who or what, and the date) on every block.

Rules:
- Nothing here goes live by itself. New suppliers load offline (`isActive = 0`) with SKUs unpublished; Tom runs SQL by hand.
- The database `distributors` table has no website column yet; a separate PR proposes `websiteUrl`.
- `server/supplierOnboarding.test.ts` fails if a supplier folder has no valid `supplier.json`.

## Unsure items go to the Cabinet Conflict tab (standing rule, Tom, Oct 31, 2026, all suppliers)
- Anything you are not sure of (an unidentified code, a guessed category or size, a medium-confidence mapping, a report-only accessory or trim item) is flagged in Cabinet Conflict. Use the existing mechanism only: `cabinets.conflictStatus`, `conflictReason`, `conflictedAt` (what `catalog.setConflict` writes and the admin Cabinet Conflict tab lists; `notInConflict()` in `server/db.ts` hides `conflict` rows from every public query). Do not invent a new flag.
- Unsure items still get a SKU like everything else: its own hidden master if no master exists (supplier code = master code and alias), `isActive = 0`, and a `distributor_skus` row with `status = 'pending'`, `isPublished = FALSE`. Nothing is skipped; Tom publishes later.
- Use `conflictStatus = 'conflict'` on hidden new masters. For a medium-confidence mapping onto an existing live master use `'review'` (stays public) and only `WHERE conflictStatus = 'none'` so an existing flag is never overwritten.
- The reason follows `formatConflictReason` in `shared/cabinetConflictFlags.ts`: Issue, Current value, Source (the document and page actually checked, or "NOT FOUND in <spec book>"), Needed, and Resolved fields. An admin resolves it in the tab.
- First applied to DL (`data/distributors/dl-cabinetry/dl_unmatched_conflicts.csv`).
