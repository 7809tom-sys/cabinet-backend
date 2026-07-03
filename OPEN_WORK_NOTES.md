# Open Work Notes (Cabinet Dealz session)

## 1. Pelican per-category markup (RESEARCH DONE, build pending user go-ahead)
- Owner confirmed imported Pelican listPrice = OUR COST.
- Markups must be editable in Admin > Pricing & Margins (no hardcoding), per supply LINE, per CATEGORY.
- Recommended starting markups saved in: Pelican_Pricing_Research.xlsx and pelican_price_research.md
  - Flooring 70%, Tile & Mosaic 55%, Sinks & Faucets 40%, Toilets & Bidets 35%, Shower & Bath 25%, Quartz Slabs 15%, Samples/Marketing 0% (hide).
- Sell price = cost x (1 + category markup%). Hide zero-cost items from customer views.

## 2. Bridge cabinet placement rule (design tool) — PENDING
- Bridge cabinets MUST start at the 72" height mark when placed above a RANGE and above a REFRIGERATOR.

## 3. Admin "Measure & Edit Material" size-update BUG — PENDING
- User reports: on admin size-editing screen, changing item SIZES won't save/persist.
- Likely the "Dimensions & Weight" tab (value="dimensions") in client/src/pages/Admin.tsx (tab list around line 642).
- Need to find the Dimensions admin component + its update tRPC mutation and fix persistence.

## 4. Base cabinet size rule (data correctness) — PENDING
- Base cabinet code encodes WIDTH: e.g. SB6 / SPB6 => 6" wide.
- Base cabinet DEFAULTS: height 34.5", depth 24".
- Several base cabinets currently have WRONG measurements; need correction + ideally auto-derive width from code and apply 34.5"x24" base defaults.

## Key file locations
- Admin page: client/src/pages/Admin.tsx (tabs list ~lines 547-649)
- Admin components: client/src/components/admin/
- Pelican router: server/routers/pelican.ts ; schema: drizzle/pelicanSchema.ts
- Cabinet schema/tables: drizzle/schema.ts

## Sandbox note
- Filesystem/page-cache has been intermittently flaky earlier this session; sandbox also throwing transient "unexpected error" on shell. Retry with short sleeps. Prefer git-committed + fsync writes.
