DL Cabinetry (dlcabinetry.com) crosswalk, built 2026-10-30 from Price List P5 (v1_13_26).
- dl_prices.csv: 200 parsed rows with tier ratio checks and typo flags.
- dl_crosswalk.csv: DL SKU -> masterCode.
- dl_distributor_setup_tidb.sql: NOT APPLIED. DL is offline, SKUs are unpublished and pending, and the multipliers are placeholders.
- build_dl.py / gen_sql.py: the scripts that generated these files (they use box paths and are kept for audit).

## Go-live (PR material only)
- `dl_go_live_tidb.sql`: Block 1 multipliers (DO NOT RUN until Rich confirms), Block 2 publish SKUs, Block 3 activate DL. Run only after Tom's explicit go-ahead.
- See findings.md "Go-live prep" for door-style lines, unknowns and the multiplier scenarios.
