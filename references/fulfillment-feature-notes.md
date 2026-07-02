# Distributor Fulfillment Feature — implementation notes

## Goal (3 requests)
1. Internal invoice/build sheet shows distributor name + cabinet door color/finish (admin-only; never leak supplier to customers except displayMode=branded).
2. Per-distributor order-intake email + reviewed "Send to distributor" action that emails a PO + NetSuite-ready CSV. Per-distributor fulfillmentMode: email | netsuite_email | netsuite_api (api = future stub).
3. Pickup option (admin-adjustable radius, default 100mi) when delivery ZIP is near a distributor warehouse.

## Schema (DONE, migration 0049 applied)
- distributors + orderEmail, ccEmails, fulfillmentMode('email'|'netsuite_email'|'netsuite_api' default email), netsuiteAccountId, pickupEnabled(bool), pickupZip, pickupAddress, pickupRadiusMiles(int default 100)
- order_requests + deliveryMethod('ship'|'pickup' default ship), distributorId, sentToDistributorAt, sentToDistributorEmail

## Key files
- Schema: drizzle/schema.ts (distributors ~L44-89, orderRequests ~L462-493)
- Orders router: server/routers/orders.ts
  - createRequest (~L551), confirm (~L659), adminListWithPoSkus (~L721-802 builds poSku = distributorCode-styleCode-distributorSku)
- Distributors router (trpc namespace `distributorAdmin`): server/routers/distributors.ts (adminList ~L73, setBranding ~L103)
- Location router (namespace `location`): server/routers/location.ts — geocodeZip + availability; uses shared/availability.ts
- Freight router: server/routers/freight.ts — resolveCartDistributorId (~L262), resolveOriginZip (~L297), local geocodeZip (~L235)
- shared/availability.ts: haversineMiles, normalizeZip, approxZipCentroid, nearestWarehouseMiles, pickNearestWarehouseZip, WarehouseRef, LatLng, DEFAULT_SERVICE_RADIUS_MI=250
- Email: server/email.ts — sendEmail(to,subject,text,html,replyTo); isEmailConfigured; need to add cc + attachments. Uses nodemailer; SMTP_* envs.
- server/lib/presentation.ts: resolvePresentation() for distributor display name.
- doorStyles table has: distributorName, finish, color, woodSpecies, doorStyle (drizzle/schema.ts ~L94-...)
- Admin invoice UI: client/src/components/admin/IncomingOrdersAdmin.tsx (OrderDetailDialog L72-203; card list L206-471). Consumes trpc.orders.adminListWithPoSkus. EnrichedLine type L26-39, OrderRow L41-55.
- Branding editor pattern: client/src/components/admin/LineBrandingEditor.tsx
- Order review (customer): client/src/components/order/OrderReview.tsx (collects zip, submits createRequest)
- appRouter registration: server/routers.ts (orders, distributorAdmin, location, freight)

## Plan for phase 2 (backend)
- shared/netsuiteOrder.ts: pure buildNetsuiteOrderCsv(lines) + pickup helper isPickupEligible / distance. + tests.
- Extend server/email.ts SendEmailOptions with cc?, attachments?.
- distributors.ts: add getFulfillment(distributorId) + updateFulfillment mutation (adminProcedure). Add fulfillment fields to adminList.
- orders.ts: enrich adminListWithPoSkus lines with distributorName + color/finish (join doorStyles). Add sendToDistributor mutation (resolve distributor, build PO text + NetSuite CSV, sendEmail to orderEmail + cc, set audit fields). For netsuite_api mode: not yet wired -> return a clear "not configured" style message but still allow email fallback.
- location.ts (or freight): pickupOptions({zip}) -> list of distributorIds offering pickup within radius + address + miles.

## Notes
- Admin invoice should show REAL distributor identity (brandName||name||code) since it's admin-only.
- Tests: 1192 passing baseline. Add netsuiteOrder.test.ts + pickup test.
