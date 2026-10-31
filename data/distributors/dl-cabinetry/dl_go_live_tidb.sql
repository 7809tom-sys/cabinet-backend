-- DL Cabinetry GO-LIVE (TiDB) -- PR material only.
-- !!! RUN ONLY AFTER TOM'S EXPLICIT GO-AHEAD. Run dl_distributor_setup_tidb.sql first. !!!
-- Each numbered block is one statement. All are idempotent (re-running changes nothing further).

-- Block 1: multipliers
-- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
-- !!! DO NOT RUN UNTIL RICH CONFIRMS: (a) are the P5 price-list numbers LIST or DEALER   !!!
-- !!! COST, and (b) the dealer discount. Values below are PLACEHOLDERS (scenario A:       !!!
-- !!! prices = dealer cost -> base 1.0, freight 0). Replace with confirmed numbers.       !!!
-- !!! costMultiplier must equal baseMultiplier * (1 + freightMultiplier) (schema.ts).     !!!
-- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
UPDATE cabinet_dealz.distributors
SET baseMultiplier = 1.0000 /* PLACEHOLDER */, freightMultiplier = 0.0000 /* PLACEHOLDER */,
    costMultiplier = 1.0000 /* PLACEHOLDER = base*(1+freight) */, retailPriceBasis = 'cost_plus_tier'
WHERE code = 'DL';

-- Block 2: publish DL SKUs (only those still pending; LINE UNKNOWN styles have no SKUs)
UPDATE cabinet_dealz.distributor_skus ds
JOIN cabinet_dealz.distributors d ON d.id = ds.distributorId AND d.code = 'DL'
SET ds.isPublished = TRUE, ds.status = 'approved'
WHERE ds.isPublished = FALSE OR ds.status <> 'approved';

-- Block 3: activate the distributor
UPDATE cabinet_dealz.distributors SET isActive = TRUE WHERE code = 'DL' AND isActive = FALSE;
