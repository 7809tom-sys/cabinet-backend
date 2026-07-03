# Pelican import — state (source of truth = DB table pelican_products)

## DB
- Table `pelican_products` (22 cols) fully seeded: 1381 rows.
- schema.ts has `pelicanProducts` drizzle def (~lines 1193-1225) + types PelicanProduct / InsertPelicanProduct.
- price-list price stored as msrp AND mirrored to listPrice. yourCost/markupPercent blank (pricing meeting).

## Categories (visible = catalog+designer; back-office = samples & merch)
- Sinks & Faucets 611 (vis) | Flooring 252 (vis) | Shower & Bath 132 (vis)
- Toilets & Bidets 58 (vis) | Tile & Mosaic 51 (vis) | Quartz Slabs (Countertops) 35 (vis)
- Samples 182 (showInCatalog=0, showInDesigner=0) | Marketing & Merchandise 60 (back-office only)

## Popular / Suggested
- Each of the 6 visible categories has exactly 6 isPopular rows, popularRank 1..6.
- Sinks = 4 real sinks (PL-FC*) + 2 faucets; Flooring = 6 real planks; others = marquee looks.
- isPopular / popularRank are admin-editable.

## REMAINING
1. Server: add pelican procedures to a router (list categories, byCategory suggested-first, admin toggle popular / visibility). 
2. Client: surface in Design Tool — browse by category, "Suggested" shown first. Back-office admin view for Samples/Merch.
3. Tests (vitest) + i18n EN/ES keys.
4. Typecheck, verify UI, checkpoint, report.

## Scripts (may vanish between commands; DB is truth): pelican_import/*.mjs, parse.py
