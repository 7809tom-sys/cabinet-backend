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
