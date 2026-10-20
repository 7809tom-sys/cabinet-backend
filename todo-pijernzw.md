

## Pelican vendor-page catalog editor — done
- [x] Show all Pelican products in the admin vendor catalog with image, product name, category, cost, selling price, visibility, and edit action.
- [x] Add atomic admin editing for product image URL, description, name, our cost, and retail/selling price directly on `/vendor?vendor=1`.
- [x] Persist the administrator-set retail price and use it as the exact selling price when present; retain category-markup fallback when blank.
- [x] Preserve existing Pelican visibility and quote-only safeguards when pricing is changed.
- [x] Add focused editor and pricing regression coverage; TypeScript and production build pass.
- [x] Database migration applied successfully for `pelican_products.retailPrice`.

## Vendor order fulfillment queue (Pelican + every vendor) — done, unpublished
- [x] New `order_shipments` table (one row per order + vendor scope), migration 0200 applied
- [x] `vendorFulfillment` router: scopes / queue / markLabelPrinted / markShipped; vendor sees only own items, no prices
- [x] Ships only when paid AND order rail = fulfillment_authorized; "Coming soon" tab is read-only
- [x] 4x6 ship-to labels (one per package) + packing slip PDFs, no prices; tracking links for UPS/FedEx/USPS/DHL
- [x] Fulfillment page + phone bottom-nav entry in Vendor Portal; Pelican vendor limited to Overview, Profile, Catalog, Shipping, Fulfillment
- [x] FIXED: Pelican vendor login never reached its catalog/shipping (identity was keyed to a supply line that does not exist); now keyed to approved vendor record sourceKey="pelican"
- [ ] OPEN: no postage purchase (no carrier label API in repo) — vendor buys postage with own carrier, enters tracking
- [ ] OPEN: orders with no affiliate have no code path to leave affiliate_review (shown as "Waiting for Cabinet Dealz to release")
- [ ] OPEN: Railway publish still failing on the platform side; publish needed before live site shows any of this

## Vendor "Upload by code" (code + door name + price) — built, unpublished
- [x] shared/vendorCodeUpload.ts: CSV/TSV/paste parser, header auto-detect, quote-aware, rejects a cut-off "$1,000"
- [x] Code matches master code OR any alias (cabinets sku/vendorSku/altSku1-3, sku_master_aliases, cabinet_aliases, global code_aliases, the line's own SKU codes); ambiguous alias is never guessed
- [x] Unknown code => new master, created hidden (no catalog/designer/2020, no invented dimensions), SKU pending + unpublished
- [x] Door name must match exactly one active door on the line (our/public/vendor name or style code)
- [x] Preview (read-only) then Commit (server re-plans from raw rows); large price moves (>=50%) flagged, not blocked
- [x] UI: "Upload by code" on My Catalog (.xlsx/.csv/paste), phone/tablet/desktop checked in real browser
- [ ] Admin review queue for uploaded-pending masters (complete spec: dimensions/category) — masters stay hidden until then
- [ ] Publish needed: Railway deploys still failing; live site does not have this yet
