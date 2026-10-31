DL Cabinetry (dlcabinetry.com) crosswalk, built 2026-10-30 from Price List P5 (v1_13_26).
- dl_prices.csv: 200 parsed rows with tier ratio checks and typo flags.
- dl_crosswalk.csv: DL SKU -> masterCode.
- dl_distributor_setup_tidb.sql: NOT APPLIED. DL is offline, SKUs are unpublished and pending, and the multipliers are placeholders.
- build_dl.py / gen_sql.py: the scripts that generated these files (they use box paths and are kept for audit).

## Go-live (PR material only)
- `dl_go_live_tidb.sql`: Block 1 multipliers (DO NOT RUN until Rich confirms), Block 2 publish SKUs, Block 3 activate DL. Run only after Tom's explicit go-ahead.
- See findings.md "Go-live prep" for door-style lines, unknowns and the multiplier scenarios.

## Freight origins (confirmed by Tom 2026-10-31)
All six DL warehouses are candidate LTL origins and are loaded into `distributors.warehouseZips` by `dl_distributor_setup_tidb.sql` (still NOT applied):
Jacksonville FL 32256 (main HQ warehouse, 8145 Baymeadows Way W; listed first), Austin TX 78754 (9019 Tuscany Way), La Vergne TN 37086 (Nashville; 1421 Gould Blvd Suite D), New Orleans LA 70126, Orlando FL 32822, Tampa FL 33634.
The platform already ships from the warehouse nearest the delivery ZIP (`server/routers/freight.ts`, nearest-warehouse resolution) and carries the chosen `shipFromZip` on the quote. If Rich/DL confirms a specific ship-from warehouse for an order, that overrides the nearest default. No application code is changed here.
Freight cost itself is the live LTL quote (weight/cube/pallets), so `freightMultiplier` stays 0.0000. The multipliers are Tom's to set.
