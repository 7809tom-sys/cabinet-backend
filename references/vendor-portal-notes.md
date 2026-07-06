# Vendor Portal — Existing Infrastructure Notes

## What Already Exists

### Auth System (server/routers/vendor.ts)
- `adminProvisionVendor` — admin creates vendor account with email/password
- Uses bcrypt for password hashing (BCRYPT_ROUNDS)
- Creates user with role="distributor", linked to a distributorId
- Users table already has: passwordHash, emailLower, failedLoginAttempts, lockedUntil, loginMethod

### Email Auth (server/routers/emailAuth.ts)
- Full email/password signup + login flow already exists
- Login checks passwordHash via bcrypt.compare
- Account lockout after failed attempts
- JWT session cookies set on success

### Distributor Portal Page (client/src/pages/DistributorPortal.tsx)
- Existing page at /distributor
- Uses Manus OAuth (useAuth hook) — checks role === "distributor" or "admin"
- Shows: catalog (with visibility toggles), orders, line info
- Has tabs: Catalog, Orders

### Distributor Portal Router (server/routers/distributorPortal.ts)
- Endpoints: myLine, catalog, setVisibility, orders, etc.
- Uses protectedProcedure (Manus OAuth session)
- Scoped by ctx.user.distributorId

### Vendor Router (server/routers/vendor.ts)
- `apply` — public vendor application submission
- `adminList` — admin reviews applications
- `adminSetStatus` — approve/reject applications
- `adminProvisionVendor` — create vendor user with email+password
- `bulkCatalogUpdate` — CSV bulk price/availability update

## What Needs to Be Built

1. **Vendor login page** — email/password form at /distributor (replace Manus OAuth gate)
   - The emailAuth router already handles login; just need a dedicated vendor login UI
   - Admin sends invite link → vendor clicks → registers with email/password

2. **Enhanced vendor dashboard** with sections:
   - Orders (already exists in distributorPortal)
   - Catalog management (partially exists — visibility toggles, bulk CSV)
   - Add new items (new)
   - Inventory integrations (NetSuite, Epicor, QuickBooks, generic REST)
   - Payment connection (Stripe Connect)
   - AI Catalog Helper ($100/hr)
   - Product promotions (vendorPromotions table already exists in schema)

3. **Invite link system** — admin generates a tokenized link, vendor clicks to register

## Database Tables Already Available
- `users` — with passwordHash, role="distributor", distributorId
- `distributors` — full distributor config
- `distributorSkus` — product catalog per distributor
- `vendorApplications` — vendor onboarding applications
- `vendorPromotions` — promotion system (already in schema)
- `vendorLines` — vendor line items
