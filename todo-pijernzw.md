

## Pelican vendor-page catalog editor — done
- [x] Show all Pelican products in the admin vendor catalog with image, product name, category, cost, selling price, visibility, and edit action.
- [x] Add atomic admin editing for product image URL, description, name, our cost, and retail/selling price directly on `/vendor?vendor=1`.
- [x] Persist the administrator-set retail price and use it as the exact selling price when present; retain category-markup fallback when blank.
- [x] Preserve existing Pelican visibility and quote-only safeguards when pricing is changed.
- [x] Add focused editor and pricing regression coverage; TypeScript and production build pass.
- [x] Database migration applied successfully for `pelican_products.retailPrice`.
