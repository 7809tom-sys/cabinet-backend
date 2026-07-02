# Working context — Save plan → CRM + Contractor role (in progress)

## Goal (confirmed by user)
- Front door: ANY visitor (homeowner or contractor) can save a plan, incl. MOBILE.
- Save captures Customer/House + Room/Plan. Contractor can save several room plans under one customer/house.
- Homeowner-saved plan → deal in DISTRIBUTOR (house) CRM.
- Self-serve contractor role: user classifies himself as a contractor → gets `contractor` role + affiliate/CRM account.
- Contractor admin area is a CRM-ONLY screen (their own board only; no other tabs).
- Deal routing: contractor-saved plan → deal in contractor's affiliate scope; distributor (house) board ALSO sees affiliate deals so both parties see it.

## Key files & facts
- Save dialog + My Plans lives in `client/src/components/design/DesignActions.tsx` (self-contained; trigger buttons at ~line 366). Rendered in DesignTool at line ~3491, inside `<div className="ml-auto hidden lg:flex ...">` (line 3381) → HIDDEN on mobile = root cause of "can't save".
- Mobile More sheet quick-action rows: DesignTool.tsx ~lines 2985-3016 (buttons). PhotorealPreview menu entry at ~3009 as the pattern to copy.
- `design.save` = publicProcedure (server/routers/design.ts ~530): userId nullable, so guests can save. Input: name (req), email?, roomData, placedCabinets, selectedStyleId?, selectedDistributorId?, projectName?, roomLabel?, roomType?.
- `crm.requestQuoteFromDesign` (server/routers/crm.ts ~623): protectedProcedure. CURRENTLY hardcodes affiliateId: null (house). Input has contactName/contactEmail/contactPhone/estimatedValue/notes. Builds title from projectName/roomLabel/contactName.
- CRM scope model (crm.ts): resolveScope(ctx) → house for role admin/designer/sales_rep; else affiliate via resolveMyAffiliateId (matches affiliates table by userId or email). scopeWhere: house => affiliateId IS NULL; affiliate => affiliateId = theirs.
- `crm.board` (crm.ts ~158) uses scopeWhere(scope) → affiliate sees only theirs; house sees only affiliateId IS NULL. NEEDS: house should ALSO see affiliate deals so distributor sees everything.
- CrmBoard component: client/src/components/crm/CrmBoard.tsx (uses trpc.crm.board). Rendered in Admin.tsx (distributor) and AffiliateDashboard.tsx (contractor).
- user.role enum in drizzle/schema.ts. Existing roles seen: admin, designer, sales_rep, user (+ partner via affiliate). Need to confirm exact enum + add `contractor` (or reuse partner+affiliate). affiliates table has userId, email, id.

## Edits done so far
- DesignActions.tsx: import useEffect; added props openSaveSignal/openLoadSignal + effects; added customerName state. STILL TODO: add Customer field UI in save dialog; pass contactName into quote; relabel grouping to Customer/House + Room/Plan; reset customerName on save; wire signals from DesignTool mobile menu.

## Remaining build order
1. DesignActions save dialog UI: Customer/House field + relabel; pass contactName to requestQuoteFromDesign; reset on success.
2. DesignTool mobile More sheet: add Save plan + My Plans rows bumping saveSignal/loadSignal; pass props to DesignActions.
3. Contractor role: schema enum + become-contractor mutation (create affiliate row + set role) + UI entry.
4. Contractor CRM-only admin screen (route/page showing just CrmBoard); gate by role.
5. crm.requestQuoteFromDesign: route deal to saver's affiliate scope if they are a contractor/affiliate; else house. Make house board include affiliate deals (distributor sees all).
6. i18n keys (EN+ES) in client/src/lib/i18n/site.ts for new labels.
7. Tests, tsc, screenshots (mobile + contractor CRM), checkpoint.


## Phase 3-4 DESIGN DECISION (contractor role) — verified against schema/crm.ts

Chosen model: lightweight `contractor` role scoped by `crmDeals.ownerUserId` (NOT the heavy affiliates/storefront system, which carries $1,195 membership + branding + storefront).

### Schema facts
- `users.role` enum (drizzle/schema.ts:27): ["user","admin","distributor","dealer","partner","designer","sales_rep"] default "user". → ADD "contractor".
- `crmDeals` (schema.ts:554): has `affiliateId` (NULL=house), `ownerUserId` (nullable). We scope contractor deals by ownerUserId = them.
- affiliates table is heavy (membership, storefront, branding) — do NOT use for self-serve contractors.

### crm.ts scope model (server/routers/crm.ts)
- `resolveScope(ctx)` (line 103): admin/designer/sales_rep => {kind:"house"} (affiliateId IS NULL). else affiliate via resolveMyAffiliateId, throws FORBIDDEN if none.
- `scopeWhere(scope)` (line 118): house => isNull(affiliateId); affiliate => eq(affiliateId, id).
- `board` (line 158): selects where scopeWhere(scope).
- `getOwnedDeal` (line 125) uses resolveScope+scopeWhere.
- `requestQuoteFromDesign` (line 623): hardcodes affiliateId:null, ownerUserId: ctx.user.id. Reuse-existing-deal loop matches affiliateId IS NULL.

### Plan for contractor scope
1. schema: add "contractor" to users.role enum; `pnpm drizzle-kit generate`; apply SQL via webdev_execute_sql.
2. crm.ts: extend scope type with {kind:"contractor"; userId}. resolveScope: role==="contractor" => {kind:"contractor", userId: ctx.user.id}. scopeWhere: contractor => eq(crmDeals.ownerUserId, userId). Keep board() returning scope kind (extend client union to include "contractor").
3. House board should ALSO see contractor + affiliate deals so DISTRIBUTOR sees everything → change house scopeWhere to NOT filter (see all) OR union. SAFER: house sees ALL deals (remove isNull filter for house) so distributor sees homeowner + contractor + affiliate deals. Confirm CrmBoard/house expectations (house currently expects only affiliateId IS NULL). Changing house to see-all is the "distributor sees everything" requirement.
   - CAUTION: getOwnedDeal for house would then allow editing affiliate deals too — acceptable for distributor/admin.
4. requestQuoteFromDesign: if caller role==="contractor", set ownerUserId = them (already does) and affiliateId stays null; deal shows on their contractor board (ownerUserId match) AND house sees-all. Homeowner (role user) save → house deal (ownerUserId=them, affiliateId null) → visible to distributor.
5. becomeContractor mutation (protected): set users.role="contractor" (only if currently "user"). Add to a router (users/auth or crm). Frontend entry: a button e.g. on account/dashboard.
6. Contractor CRM-only screen: new route (e.g. /crm or reuse AffiliateDashboard-like). Gate: role==="contractor" → render ONLY CrmBoard. Add nav entry. Check App.tsx routing + useAuth role.

### Client files
- CrmBoard: client/src/components/crm/CrmBoard.tsx (trpc.crm.board). board response `scope` union currently "house"|"affiliate" → extend to include "contractor".
- Admin.tsx (distributor CRM), AffiliateDashboard.tsx (partner CRM) render CrmBoard.
- useAuth: client/src/_core/hooks/useAuth.ts (user.role).

### i18n done so far (site.ts)
- Added dt_act_customer_name / _ph / _hint, dt_act_customer_house, dt_act_room_plan (EN+ES).
- Added dt_sh_save_plan, dt_sh_my_plans (EN+ES).
- Mobile More sheet now has Save plan + My Plans (signals). DesignActions has openSaveSignal/openLoadSignal + customerName field passing contactName to quote.
