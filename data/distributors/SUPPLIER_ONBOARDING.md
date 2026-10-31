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

## Standing rules A-D (Tom, Oct 31, 2026, all suppliers)
- **A. No skipping.** Every unmatched or "report only" item is looked up in the supplier's spec book and gets a decision (map, alias, or hidden new master) with the page or source recorded ("NOT FOUND in <spec book>" when it is not there). Nothing is left report-only or skipped.
- **B. No price changes.** Every SKU keeps its own price-list price as-is. Do not add, combine or adjust prices (for example a glass door SKU is not repriced as cabinet + door).
- **C. Unsure = Cabinet Conflict.** Anything not certain still gets its SKU, and is flagged with the existing mechanism (see the section above) with the reason and the sources checked.
- **D. Naming.** The master holds the uniform nomenclature, the shared customer-facing name. Each distributor's own description, dimensions, spec page and spec images stay on that distributor's SKU/supplier record (`distributor_skus.supplierCabinetName`, `geometryWidth/Height/Depth`, `geometrySourcePage`, `geometryStatus`; `distributor_cabinet_overrides` for per-supplier images), never on the master, so a customer switching suppliers sees one item with each supplier's specs. If a needed field does not exist, do not add a migration in the same PR; list what is needed for Tom.
- **E. Never cross-link unique items.** An item a supplier carries that regular catalog items do not (for example DL 2DB33, a two-drawer base) gets its own master and is never linked, aliased, substituted or cross-referenced to a similar regular cabinet.
