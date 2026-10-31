-- DL Cabinetry distributor setup for TiDB -- PREPARED, NOT APPLIED. Do not run without Tom's review.
-- Source: DL 'Price List - P5 (v1_13_26)' from Rich (received 2026-10-09). Prices are DL published Core/Slim/Luxe list prices.
-- Idempotent: every block is a single INSERT ... SELECT ... WHERE NOT EXISTS.
-- PLACEHOLDERS: costMultiplier/baseMultiplier/freightMultiplier are UNKNOWN (DL dealer discount + freight not provided).
--   costMultiplier = 1.0000 / baseMultiplier = 1.0000 / freightMultiplier = 0.0000 are PLACEHOLDERS -> confirm before isActive = 1.
-- Line ships OFF: distributors.isActive = 0 (Offline in Admin > Distributors); every SKU isPublished = 0, status = 'pending'.

-- Block 1: distributor row (white-labeled, offline)
INSERT INTO cabinet_dealz.distributors (code, name, initials, brandName, brandInitials, whiteLabel, displayMode, costMultiplier, baseMultiplier, freightMultiplier, retailPriceBasis, warehouseName, isActive)
SELECT 'DL', 'Line DL', 'DL', 'DL Cabinetry', 'DL', TRUE, 'neutral', 1.0000 /* PLACEHOLDER */, 1.0000 /* PLACEHOLDER */, 0.0000 /* PLACEHOLDER */, 'cost_plus_tier', 'DL Cabinetry (Austin/Jacksonville/Nashville/New Orleans/Orlando/Tampa) - origin ZIPs TBD', 0
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM cabinet_dealz.distributors WHERE code = 'DL');

-- Block 2: door style / tier Core (actual DL door style names/colors per tier NOT in price list - placeholder names)
INSERT INTO cabinet_dealz.door_styles (distributorId, styleCode, ourName, distributorName, boxConstruction, isActive)
SELECT d.id, 'DL-CORE', 'DL Core (placeholder)', 'DL Cabinetry Core', 'Framed plywood RTA', FALSE FROM cabinet_dealz.distributors d
WHERE d.code = 'DL' AND NOT EXISTS (SELECT 1 FROM cabinet_dealz.door_styles s WHERE s.distributorId = d.id AND s.styleCode = 'DL-CORE');

-- Block 3: door style / tier Slim (actual DL door style names/colors per tier NOT in price list - placeholder names)
INSERT INTO cabinet_dealz.door_styles (distributorId, styleCode, ourName, distributorName, boxConstruction, isActive)
SELECT d.id, 'DL-SLIM', 'DL Slim (placeholder)', 'DL Cabinetry Slim', 'Framed plywood RTA', FALSE FROM cabinet_dealz.distributors d
WHERE d.code = 'DL' AND NOT EXISTS (SELECT 1 FROM cabinet_dealz.door_styles s WHERE s.distributorId = d.id AND s.styleCode = 'DL-SLIM');

-- Block 4: door style / tier Luxe (actual DL door style names/colors per tier NOT in price list - placeholder names)
INSERT INTO cabinet_dealz.door_styles (distributorId, styleCode, ourName, distributorName, boxConstruction, isActive)
SELECT d.id, 'DL-LUXE', 'DL Luxe (placeholder)', 'DL Cabinetry Luxe', 'Framed plywood RTA', FALSE FROM cabinet_dealz.distributors d
WHERE d.code = 'DL' AND NOT EXISTS (SELECT 1 FROM cabinet_dealz.door_styles s WHERE s.distributorId = d.id AND s.styleCode = 'DL-LUXE');

-- Block 5: distributor_skus for tier Core (109 mapped SKUs, high/medium confidence; unpublished, pending)
INSERT INTO cabinet_dealz.distributor_skus (cabinetId, distributorId, styleId, platformSku, distributorSku, constructionType, listPrice, isPublished, status, supplierCabinetName)
SELECT c.id, ds.distributorId, ds.id, CONCAT(m.dlSku, '-CORE-DL'), m.dlSku, 'framed', m.listPrice, FALSE, 'pending', m.dlSku
FROM (
  SELECT 'W1542' AS dlSku, 'W1542' AS masterCode, 115 AS listPrice
  UNION ALL
  SELECT 'WDC243612' AS dlSku, 'WDC2436' AS masterCode, 225 AS listPrice
  UNION ALL
  SELECT 'WDC244212' AS dlSku, 'WDC2442' AS masterCode, 249 AS listPrice
  UNION ALL
  SELECT 'W1830' AS dlSku, 'W1830' AS masterCode, 101 AS listPrice
  UNION ALL
  SELECT 'FILLER 3X96' AS dlSku, 'WF396' AS masterCode, 37 AS listPrice
  UNION ALL
  SELECT 'W1836' AS dlSku, 'W1836' AS masterCode, 112 AS listPrice
  UNION ALL
  SELECT 'W1842' AS dlSku, 'W1842' AS masterCode, 120 AS listPrice
  UNION ALL
  SELECT '2DB30' AS dlSku, '2DB30' AS masterCode, 248 AS listPrice
  UNION ALL
  SELECT 'FSB36' AS dlSku, 'FSB36' AS masterCode, 183 AS listPrice
  UNION ALL
  SELECT 'W2130' AS dlSku, 'W2130' AS masterCode, 107 AS listPrice
  UNION ALL
  SELECT '2DB36' AS dlSku, '2DB36' AS masterCode, 275 AS listPrice
  UNION ALL
  SELECT 'W2136' AS dlSku, 'W2136' AS masterCode, 119 AS listPrice
  UNION ALL
  SELECT 'W2142' AS dlSku, 'W2142' AS masterCode, 127 AS listPrice
  UNION ALL
  SELECT 'LZS33' AS dlSku, 'LSB33' AS masterCode, 252 AS listPrice
  UNION ALL
  SELECT 'B12' AS dlSku, 'B12' AS masterCode, 112 AS listPrice
  UNION ALL
  SELECT 'LZS3612' AS dlSku, 'LS3612' AS masterCode, 271 AS listPrice
  UNION ALL
  SELECT 'B15' AS dlSku, 'B15' AS masterCode, 127 AS listPrice
  UNION ALL
  SELECT 'OVD338427' AS dlSku, 'O338424' AS masterCode, 469 AS listPrice
  UNION ALL
  SELECT 'W2418' AS dlSku, 'W2418' AS masterCode, 100 AS listPrice
  UNION ALL
  SELECT 'B18' AS dlSku, 'B18' AS masterCode, 134 AS listPrice
  UNION ALL
  SELECT 'OVD339027' AS dlSku, 'O339024' AS masterCode, 488 AS listPrice
  UNION ALL
  SELECT 'B21' AS dlSku, 'B21' AS masterCode, 146 AS listPrice
  UNION ALL
  SELECT 'OVD339627' AS dlSku, 'O339624' AS masterCode, 509 AS listPrice
  UNION ALL
  SELECT 'W2430' AS dlSku, 'W2430' AS masterCode, 124 AS listPrice
  UNION ALL
  SELECT 'WF3 42' AS dlSku, 'WF342' AS masterCode, 17 AS listPrice
  UNION ALL
  SELECT 'B24' AS dlSku, 'B24' AS masterCode, 166 AS listPrice
  UNION ALL
  SELECT 'W2436' AS dlSku, 'W2436' AS masterCode, 141 AS listPrice
  UNION ALL
  SELECT 'WF6 42' AS dlSku, 'WF642' AS masterCode, 32 AS listPrice
  UNION ALL
  SELECT 'B27' AS dlSku, 'B27' AS masterCode, 180 AS listPrice
  UNION ALL
  SELECT 'W2442' AS dlSku, 'W2442' AS masterCode, 155 AS listPrice
  UNION ALL
  SELECT 'B30' AS dlSku, 'B30' AS masterCode, 187 AS listPrice
  UNION ALL
  SELECT 'B33' AS dlSku, 'B33' AS masterCode, 198 AS listPrice
  UNION ALL
  SELECT 'W2730' AS dlSku, 'W2730' AS masterCode, 128 AS listPrice
  UNION ALL
  SELECT 'B36' AS dlSku, 'B36' AS masterCode, 208 AS listPrice
  UNION ALL
  SELECT 'W2736' AS dlSku, 'W2736' AS masterCode, 147 AS listPrice
  UNION ALL
  SELECT 'B39' AS dlSku, 'B39' AS masterCode, 225 AS listPrice
  UNION ALL
  SELECT 'SB30' AS dlSku, 'SB30' AS masterCode, 164 AS listPrice
  UNION ALL
  SELECT 'W2742' AS dlSku, 'W2742' AS masterCode, 163 AS listPrice
  UNION ALL
  SELECT 'B42' AS dlSku, 'B42' AS masterCode, 245 AS listPrice
  UNION ALL
  SELECT 'SB36' AS dlSku, 'SB36' AS masterCode, 183 AS listPrice
  UNION ALL
  SELECT 'W3012' AS dlSku, 'W3012' AS masterCode, 98 AS listPrice
  UNION ALL
  SELECT 'W3015' AS dlSku, 'W3015' AS masterCode, 106 AS listPrice
  UNION ALL
  SELECT 'W3018' AS dlSku, 'W3018' AS masterCode, 116 AS listPrice
  UNION ALL
  SELECT 'W3024' AS dlSku, 'W3024' AS masterCode, 127 AS listPrice
  UNION ALL
  SELECT 'W3030' AS dlSku, 'W3030' AS masterCode, 139 AS listPrice
  UNION ALL
  SELECT 'BF3' AS dlSku, 'BF3' AS masterCode, 15 AS listPrice
  UNION ALL
  SELECT 'W3036' AS dlSku, 'W3036' AS masterCode, 155 AS listPrice
  UNION ALL
  SELECT 'WP188427' AS dlSku, 'U188424' AS masterCode, 348 AS listPrice
  UNION ALL
  SELECT 'BF6' AS dlSku, 'BF6' AS masterCode, 28 AS listPrice
  UNION ALL
  SELECT 'W3042' AS dlSku, 'W3042' AS masterCode, 169 AS listPrice
  UNION ALL
  SELECT 'WP189027' AS dlSku, 'U189024' AS masterCode, 385 AS listPrice
  UNION ALL
  SELECT 'BMC30' AS dlSku, 'BMC30' AS masterCode, 248 AS listPrice
  UNION ALL
  SELECT 'TK8' AS dlSku, 'TK8(TKC)' AS masterCode, 17 AS listPrice
  UNION ALL
  SELECT 'W3312' AS dlSku, 'W3312' AS masterCode, 102 AS listPrice
  UNION ALL
  SELECT 'WP189627' AS dlSku, 'U189624' AS masterCode, 402 AS listPrice
  UNION ALL
  SELECT 'W3315' AS dlSku, 'W3315' AS masterCode, 112 AS listPrice
  UNION ALL
  SELECT 'WP248427' AS dlSku, 'U248424' AS masterCode, 408 AS listPrice
  UNION ALL
  SELECT 'W3318' AS dlSku, 'W3318' AS masterCode, 122 AS listPrice
  UNION ALL
  SELECT 'WP249027' AS dlSku, 'U249024' AS masterCode, 420 AS listPrice
  UNION ALL
  SELECT 'VAN24' AS dlSku, 'V2421' AS masterCode, 139 AS listPrice
  UNION ALL
  SELECT 'W3324' AS dlSku, 'W3324' AS masterCode, 135 AS listPrice
  UNION ALL
  SELECT 'WP249627' AS dlSku, 'U249624' AS masterCode, 439 AS listPrice
  UNION ALL
  SELECT 'VAN30' AS dlSku, 'V3021' AS masterCode, 166 AS listPrice
  UNION ALL
  SELECT 'W3330' AS dlSku, 'W3330' AS masterCode, 147 AS listPrice
  UNION ALL
  SELECT 'WP308427' AS dlSku, 'U308424' AS masterCode, 525 AS listPrice
  UNION ALL
  SELECT 'DB12' AS dlSku, '3DB12' AS masterCode, 170 AS listPrice
  UNION ALL
  SELECT 'VAN36DL' AS dlSku, 'V3621DL' AS masterCode, 205 AS listPrice
  UNION ALL
  SELECT 'W3336' AS dlSku, 'W3336' AS masterCode, 160 AS listPrice
  UNION ALL
  SELECT 'WP309027' AS dlSku, 'U309024' AS masterCode, 542 AS listPrice
  UNION ALL
  SELECT 'DB15' AS dlSku, '3DB15' AS masterCode, 179 AS listPrice
  UNION ALL
  SELECT 'VAN36DR' AS dlSku, 'V3621DR' AS masterCode, 205 AS listPrice
  UNION ALL
  SELECT 'W3342' AS dlSku, 'W3342' AS masterCode, 176 AS listPrice
  UNION ALL
  SELECT 'WP309627' AS dlSku, 'U309624' AS masterCode, 558 AS listPrice
  UNION ALL
  SELECT 'DB18' AS dlSku, '3DB18' AS masterCode, 190 AS listPrice
  UNION ALL
  SELECT 'W3612' AS dlSku, 'W3612' AS masterCode, 112 AS listPrice
  UNION ALL
  SELECT 'WRC3018' AS dlSku, 'WRC3018' AS masterCode, 93 AS listPrice
  UNION ALL
  SELECT 'DB21' AS dlSku, '3DB21' AS masterCode, 201 AS listPrice
  UNION ALL
  SELECT 'VDB12' AS dlSku, 'VDB1221(3VDB12)' AS masterCode, 157 AS listPrice
  UNION ALL
  SELECT 'W361227' AS dlSku, 'W361224' AS masterCode, 124 AS listPrice
  UNION ALL
  SELECT 'DB24' AS dlSku, '3DB24' AS masterCode, 221 AS listPrice
  UNION ALL
  SELECT 'VDB15' AS dlSku, 'VDB1521(3VDB15)' AS masterCode, 166 AS listPrice
  UNION ALL
  SELECT 'W3615' AS dlSku, 'W3615' AS masterCode, 122 AS listPrice
  UNION ALL
  SELECT 'DB27' AS dlSku, '3DB27' AS masterCode, 240 AS listPrice
  UNION ALL
  SELECT 'VDB18' AS dlSku, 'VDB1821(3VDB18)' AS masterCode, 176 AS listPrice
  UNION ALL
  SELECT 'W361527' AS dlSku, 'W361524' AS masterCode, 140 AS listPrice
  UNION ALL
  SELECT 'DB30' AS dlSku, '3DB30' AS masterCode, 248 AS listPrice
  UNION ALL
  SELECT 'VDB24' AS dlSku, 'VDB2421' AS masterCode, 204 AS listPrice
  UNION ALL
  SELECT 'W3618' AS dlSku, 'W3618' AS masterCode, 140 AS listPrice
  UNION ALL
  SELECT 'DB33' AS dlSku, '3DB33' AS masterCode, 263 AS listPrice
  UNION ALL
  SELECT 'VSB36' AS dlSku, 'VS36' AS masterCode, 174 AS listPrice
  UNION ALL
  SELECT 'W361827' AS dlSku, 'W361824' AS masterCode, 156 AS listPrice
  UNION ALL
  SELECT 'DB36' AS dlSku, '3DB36' AS masterCode, 275 AS listPrice
  UNION ALL
  SELECT 'W0930' AS dlSku, 'W0930' AS masterCode, 63 AS listPrice
  UNION ALL
  SELECT 'W3624' AS dlSku, 'W3624' AS masterCode, 153 AS listPrice
  UNION ALL
  SELECT 'W0936' AS dlSku, 'W0936' AS masterCode, 73 AS listPrice
  UNION ALL
  SELECT 'W362427' AS dlSku, 'W362424' AS masterCode, 168 AS listPrice
  UNION ALL
  SELECT 'W0942' AS dlSku, 'W0942' AS masterCode, 88 AS listPrice
  UNION ALL
  SELECT 'W3630' AS dlSku, 'W3630' AS masterCode, 169 AS listPrice
  UNION ALL
  SELECT 'W3636' AS dlSku, 'W3636' AS masterCode, 183 AS listPrice
  UNION ALL
  SELECT 'W1230' AS dlSku, 'W1230' AS masterCode, 80 AS listPrice
  UNION ALL
  SELECT 'W3642' AS dlSku, 'W3642' AS masterCode, 206 AS listPrice
  UNION ALL
  SELECT 'W1236' AS dlSku, 'W1236' AS masterCode, 93 AS listPrice
  UNION ALL
  SELECT 'WBC2730' AS dlSku, 'WBC2730' AS masterCode, 119 AS listPrice
  UNION ALL
  SELECT 'W1242' AS dlSku, 'W1242' AS masterCode, 107 AS listPrice
  UNION ALL
  SELECT 'WBC2736' AS dlSku, 'WBC2736' AS masterCode, 136 AS listPrice
  UNION ALL
  SELECT 'WBC2742' AS dlSku, 'WBC2742' AS masterCode, 151 AS listPrice
  UNION ALL
  SELECT 'W1530' AS dlSku, 'W-15-30' AS masterCode, 88 AS listPrice
  UNION ALL
  SELECT 'W1536' AS dlSku, 'W1536' AS masterCode, 100 AS listPrice
  UNION ALL
  SELECT 'WDC243012' AS dlSku, 'WDC2430' AS masterCode, 211 AS listPrice
) m
JOIN cabinet_dealz.cabinets c ON c.masterCode = m.masterCode
JOIN cabinet_dealz.door_styles ds ON ds.styleCode = 'DL-CORE' AND ds.distributorId = (SELECT id FROM cabinet_dealz.distributors WHERE code = 'DL')
WHERE NOT EXISTS (SELECT 1 FROM cabinet_dealz.distributor_skus x WHERE x.platformSku = CONCAT(m.dlSku, '-CORE-DL'))
  AND NOT EXISTS (SELECT 1 FROM cabinet_dealz.distributor_skus y WHERE y.distributorId = ds.distributorId AND y.styleId = ds.id AND y.cabinetId = c.id);

-- Block 6: distributor_skus for tier Slim (109 mapped SKUs, high/medium confidence; unpublished, pending)
INSERT INTO cabinet_dealz.distributor_skus (cabinetId, distributorId, styleId, platformSku, distributorSku, constructionType, listPrice, isPublished, status, supplierCabinetName)
SELECT c.id, ds.distributorId, ds.id, CONCAT(m.dlSku, '-SLIM-DL'), m.dlSku, 'framed', m.listPrice, FALSE, 'pending', m.dlSku
FROM (
  SELECT 'W1542' AS dlSku, 'W1542' AS masterCode, 126 AS listPrice
  UNION ALL
  SELECT 'WDC243612' AS dlSku, 'WDC2436' AS masterCode, 248 AS listPrice
  UNION ALL
  SELECT 'WDC244212' AS dlSku, 'WDC2442' AS masterCode, 275 AS listPrice
  UNION ALL
  SELECT 'W1830' AS dlSku, 'W1830' AS masterCode, 110 AS listPrice
  UNION ALL
  SELECT 'FILLER 3X96' AS dlSku, 'WF396' AS masterCode, 37 AS listPrice
  UNION ALL
  SELECT 'W1836' AS dlSku, 'W1836' AS masterCode, 123 AS listPrice
  UNION ALL
  SELECT 'W1842' AS dlSku, 'W1842' AS masterCode, 132 AS listPrice
  UNION ALL
  SELECT '2DB30' AS dlSku, '2DB30' AS masterCode, 273 AS listPrice
  UNION ALL
  SELECT 'FSB36' AS dlSku, 'FSB36' AS masterCode, 201 AS listPrice
  UNION ALL
  SELECT 'W2130' AS dlSku, 'W2130' AS masterCode, 118 AS listPrice
  UNION ALL
  SELECT '2DB36' AS dlSku, '2DB36' AS masterCode, 303 AS listPrice
  UNION ALL
  SELECT 'W2136' AS dlSku, 'W2136' AS masterCode, 131 AS listPrice
  UNION ALL
  SELECT 'W2142' AS dlSku, 'W2142' AS masterCode, 139 AS listPrice
  UNION ALL
  SELECT 'LZS33' AS dlSku, 'LSB33' AS masterCode, 277 AS listPrice
  UNION ALL
  SELECT 'B12' AS dlSku, 'B12' AS masterCode, 123 AS listPrice
  UNION ALL
  SELECT 'LZS3612' AS dlSku, 'LS3612' AS masterCode, 298 AS listPrice
  UNION ALL
  SELECT 'B15' AS dlSku, 'B15' AS masterCode, 141 AS listPrice
  UNION ALL
  SELECT 'OVD338427' AS dlSku, 'O338424' AS masterCode, 517 AS listPrice
  UNION ALL
  SELECT 'W2418' AS dlSku, 'W2418' AS masterCode, 110 AS listPrice
  UNION ALL
  SELECT 'B18' AS dlSku, 'B18' AS masterCode, 147 AS listPrice
  UNION ALL
  SELECT 'OVD339027' AS dlSku, 'O339024' AS masterCode, 537 AS listPrice
  UNION ALL
  SELECT 'B21' AS dlSku, 'B21' AS masterCode, 161 AS listPrice
  UNION ALL
  SELECT 'OVD339627' AS dlSku, 'O339624' AS masterCode, 560 AS listPrice
  UNION ALL
  SELECT 'W2430' AS dlSku, 'W2430' AS masterCode, 136 AS listPrice
  UNION ALL
  SELECT 'WF3 42' AS dlSku, 'WF342' AS masterCode, 17 AS listPrice
  UNION ALL
  SELECT 'B24' AS dlSku, 'B24' AS masterCode, 183 AS listPrice
  UNION ALL
  SELECT 'W2436' AS dlSku, 'W2436' AS masterCode, 155 AS listPrice
  UNION ALL
  SELECT 'WF6 42' AS dlSku, 'WF642' AS masterCode, 32 AS listPrice
  UNION ALL
  SELECT 'B27' AS dlSku, 'B27' AS masterCode, 198 AS listPrice
  UNION ALL
  SELECT 'W2442' AS dlSku, 'W2442' AS masterCode, 171 AS listPrice
  UNION ALL
  SELECT 'B30' AS dlSku, 'B30' AS masterCode, 206 AS listPrice
  UNION ALL
  SELECT 'B33' AS dlSku, 'B33' AS masterCode, 218 AS listPrice
  UNION ALL
  SELECT 'W2730' AS dlSku, 'W2730' AS masterCode, 142 AS listPrice
  UNION ALL
  SELECT 'B36' AS dlSku, 'B36' AS masterCode, 229 AS listPrice
  UNION ALL
  SELECT 'W2736' AS dlSku, 'W2736' AS masterCode, 162 AS listPrice
  UNION ALL
  SELECT 'B39' AS dlSku, 'B39' AS masterCode, 248 AS listPrice
  UNION ALL
  SELECT 'SB30' AS dlSku, 'SB30' AS masterCode, 181 AS listPrice
  UNION ALL
  SELECT 'W2742' AS dlSku, 'W2742' AS masterCode, 179 AS listPrice
  UNION ALL
  SELECT 'B42' AS dlSku, 'B42' AS masterCode, 269 AS listPrice
  UNION ALL
  SELECT 'SB36' AS dlSku, 'SB36' AS masterCode, 201 AS listPrice
  UNION ALL
  SELECT 'W3012' AS dlSku, 'W3012' AS masterCode, 108 AS listPrice
  UNION ALL
  SELECT 'W3015' AS dlSku, 'W3015' AS masterCode, 117 AS listPrice
  UNION ALL
  SELECT 'W3018' AS dlSku, 'W3018' AS masterCode, 128 AS listPrice
  UNION ALL
  SELECT 'W3024' AS dlSku, 'W3024' AS masterCode, 139 AS listPrice
  UNION ALL
  SELECT 'W3030' AS dlSku, 'W3030' AS masterCode, 153 AS listPrice
  UNION ALL
  SELECT 'BF3' AS dlSku, 'BF3' AS masterCode, 15 AS listPrice
  UNION ALL
  SELECT 'W3036' AS dlSku, 'W3036' AS masterCode, 171 AS listPrice
  UNION ALL
  SELECT 'WP188427' AS dlSku, 'U188424' AS masterCode, 383 AS listPrice
  UNION ALL
  SELECT 'BF6' AS dlSku, 'BF6' AS masterCode, 28 AS listPrice
  UNION ALL
  SELECT 'W3042' AS dlSku, 'W3042' AS masterCode, 186 AS listPrice
  UNION ALL
  SELECT 'WP189027' AS dlSku, 'U189024' AS masterCode, 424 AS listPrice
  UNION ALL
  SELECT 'BMC30' AS dlSku, 'BMC30' AS masterCode, 273 AS listPrice
  UNION ALL
  SELECT 'TK8' AS dlSku, 'TK8(TKC)' AS masterCode, 17 AS listPrice
  UNION ALL
  SELECT 'W3312' AS dlSku, 'W3312' AS masterCode, 112 AS listPrice
  UNION ALL
  SELECT 'WP189627' AS dlSku, 'U189624' AS masterCode, 442 AS listPrice
  UNION ALL
  SELECT 'W3315' AS dlSku, 'W3315' AS masterCode, 124 AS listPrice
  UNION ALL
  SELECT 'WP248427' AS dlSku, 'U248424' AS masterCode, 449 AS listPrice
  UNION ALL
  SELECT 'W3318' AS dlSku, 'W3318' AS masterCode, 135 AS listPrice
  UNION ALL
  SELECT 'WP249027' AS dlSku, 'U249024' AS masterCode, 462 AS listPrice
  UNION ALL
  SELECT 'VAN24' AS dlSku, 'V2421' AS masterCode, 153 AS listPrice
  UNION ALL
  SELECT 'W3324' AS dlSku, 'W3324' AS masterCode, 148 AS listPrice
  UNION ALL
  SELECT 'WP249627' AS dlSku, 'U249624' AS masterCode, 483 AS listPrice
  UNION ALL
  SELECT 'VAN30' AS dlSku, 'V3021' AS masterCode, 183 AS listPrice
  UNION ALL
  SELECT 'W3330' AS dlSku, 'W3330' AS masterCode, 162 AS listPrice
  UNION ALL
  SELECT 'WP308427' AS dlSku, 'U308424' AS masterCode, 578 AS listPrice
  UNION ALL
  SELECT 'DB12' AS dlSku, '3DB12' AS masterCode, 187 AS listPrice
  UNION ALL
  SELECT 'VAN36DL' AS dlSku, 'V3621DL' AS masterCode, 225 AS listPrice
  UNION ALL
  SELECT 'W3336' AS dlSku, 'W3336' AS masterCode, 176 AS listPrice
  UNION ALL
  SELECT 'WP309027' AS dlSku, 'U309024' AS masterCode, 596 AS listPrice
  UNION ALL
  SELECT 'DB15' AS dlSku, '3DB15' AS masterCode, 197 AS listPrice
  UNION ALL
  SELECT 'VAN36DR' AS dlSku, 'V3621DR' AS masterCode, 225 AS listPrice
  UNION ALL
  SELECT 'W3342' AS dlSku, 'W3342' AS masterCode, 193 AS listPrice
  UNION ALL
  SELECT 'WP309627' AS dlSku, 'U309624' AS masterCode, 614 AS listPrice
  UNION ALL
  SELECT 'DB18' AS dlSku, '3DB18' AS masterCode, 209 AS listPrice
  UNION ALL
  SELECT 'W3612' AS dlSku, 'W3612' AS masterCode, 124 AS listPrice
  UNION ALL
  SELECT 'WRC3018' AS dlSku, 'WRC3018' AS masterCode, 93 AS listPrice
  UNION ALL
  SELECT 'DB21' AS dlSku, '3DB21' AS masterCode, 221 AS listPrice
  UNION ALL
  SELECT 'VDB12' AS dlSku, 'VDB1221(3VDB12)' AS masterCode, 172 AS listPrice
  UNION ALL
  SELECT 'W361227' AS dlSku, 'W361224' AS masterCode, 136 AS listPrice
  UNION ALL
  SELECT 'DB24' AS dlSku, '3DB24' AS masterCode, 243 AS listPrice
  UNION ALL
  SELECT 'VDB15' AS dlSku, 'VDB1521(3VDB15)' AS masterCode, 183 AS listPrice
  UNION ALL
  SELECT 'W3615' AS dlSku, 'W3615' AS masterCode, 135 AS listPrice
  UNION ALL
  SELECT 'DB27' AS dlSku, '3DB27' AS masterCode, 264 AS listPrice
  UNION ALL
  SELECT 'VDB18' AS dlSku, 'VDB1821(3VDB18)' AS masterCode, 193 AS listPrice
  UNION ALL
  SELECT 'W361527' AS dlSku, 'W361524' AS masterCode, 154 AS listPrice
  UNION ALL
  SELECT 'DB30' AS dlSku, '3DB30' AS masterCode, 273 AS listPrice
  UNION ALL
  SELECT 'VDB24' AS dlSku, 'VDB2421' AS masterCode, 225 AS listPrice
  UNION ALL
  SELECT 'W3618' AS dlSku, 'W3618' AS masterCode, 154 AS listPrice
  UNION ALL
  SELECT 'DB33' AS dlSku, '3DB33' AS masterCode, 290 AS listPrice
  UNION ALL
  SELECT 'VSB36' AS dlSku, 'VS36' AS masterCode, 191 AS listPrice
  UNION ALL
  SELECT 'W361827' AS dlSku, 'W361824' AS masterCode, 171 AS listPrice
  UNION ALL
  SELECT 'DB36' AS dlSku, '3DB36' AS masterCode, 303 AS listPrice
  UNION ALL
  SELECT 'W0930' AS dlSku, 'W0930' AS masterCode, 69 AS listPrice
  UNION ALL
  SELECT 'W3624' AS dlSku, 'W3624' AS masterCode, 169 AS listPrice
  UNION ALL
  SELECT 'W0936' AS dlSku, 'W0936' AS masterCode, 80 AS listPrice
  UNION ALL
  SELECT 'W362427' AS dlSku, 'W362424' AS masterCode, 185 AS listPrice
  UNION ALL
  SELECT 'W0942' AS dlSku, 'W0942' AS masterCode, 98 AS listPrice
  UNION ALL
  SELECT 'W3630' AS dlSku, 'W3630' AS masterCode, 186 AS listPrice
  UNION ALL
  SELECT 'W3636' AS dlSku, 'W3636' AS masterCode, 201 AS listPrice
  UNION ALL
  SELECT 'W1230' AS dlSku, 'W1230' AS masterCode, 88 AS listPrice
  UNION ALL
  SELECT 'W3642' AS dlSku, 'W3642' AS masterCode, 227 AS listPrice
  UNION ALL
  SELECT 'W1236' AS dlSku, 'W1236' AS masterCode, 102 AS listPrice
  UNION ALL
  SELECT 'WBC2730' AS dlSku, 'WBC2730' AS masterCode, 131 AS listPrice
  UNION ALL
  SELECT 'W1242' AS dlSku, 'W1242' AS masterCode, 118 AS listPrice
  UNION ALL
  SELECT 'WBC2736' AS dlSku, 'WBC2736' AS masterCode, 150 AS listPrice
  UNION ALL
  SELECT 'WBC2742' AS dlSku, 'WBC2742' AS masterCode, 166 AS listPrice
  UNION ALL
  SELECT 'W1530' AS dlSku, 'W-15-30' AS masterCode, 98 AS listPrice
  UNION ALL
  SELECT 'W1536' AS dlSku, 'W1536' AS masterCode, 110 AS listPrice
  UNION ALL
  SELECT 'WDC243012' AS dlSku, 'WDC2430' AS masterCode, 232 AS listPrice
) m
JOIN cabinet_dealz.cabinets c ON c.masterCode = m.masterCode
JOIN cabinet_dealz.door_styles ds ON ds.styleCode = 'DL-SLIM' AND ds.distributorId = (SELECT id FROM cabinet_dealz.distributors WHERE code = 'DL')
WHERE NOT EXISTS (SELECT 1 FROM cabinet_dealz.distributor_skus x WHERE x.platformSku = CONCAT(m.dlSku, '-SLIM-DL'))
  AND NOT EXISTS (SELECT 1 FROM cabinet_dealz.distributor_skus y WHERE y.distributorId = ds.distributorId AND y.styleId = ds.id AND y.cabinetId = c.id);

-- Block 7: distributor_skus for tier Luxe (109 mapped SKUs, high/medium confidence; unpublished, pending)
INSERT INTO cabinet_dealz.distributor_skus (cabinetId, distributorId, styleId, platformSku, distributorSku, constructionType, listPrice, isPublished, status, supplierCabinetName)
SELECT c.id, ds.distributorId, ds.id, CONCAT(m.dlSku, '-LUXE-DL'), m.dlSku, 'framed', m.listPrice, FALSE, 'pending', m.dlSku
FROM (
  SELECT 'W1542' AS dlSku, 'W1542' AS masterCode, 229 AS listPrice
  UNION ALL
  SELECT 'WDC243612' AS dlSku, 'WDC2436' AS masterCode, 450 AS listPrice
  UNION ALL
  SELECT 'WDC244212' AS dlSku, 'WDC2442' AS masterCode, 498 AS listPrice
  UNION ALL
  SELECT 'W1830' AS dlSku, 'W1830' AS masterCode, 201 AS listPrice
  UNION ALL
  SELECT 'FILLER 3X96' AS dlSku, 'WF396' AS masterCode, 74 AS listPrice
  UNION ALL
  SELECT 'W1836' AS dlSku, 'W1836' AS masterCode, 223 AS listPrice
  UNION ALL
  SELECT 'W1842' AS dlSku, 'W1842' AS masterCode, 240 AS listPrice
  UNION ALL
  SELECT '2DB30' AS dlSku, '2DB30' AS masterCode, 495 AS listPrice
  UNION ALL
  SELECT 'FSB36' AS dlSku, 'FSB36' AS masterCode, 365 AS listPrice
  UNION ALL
  SELECT 'W2130' AS dlSku, 'W2130' AS masterCode, 214 AS listPrice
  UNION ALL
  SELECT '2DB36' AS dlSku, '2DB36' AS masterCode, 550 AS listPrice
  UNION ALL
  SELECT 'W2136' AS dlSku, 'W2136' AS masterCode, 238 AS listPrice
  UNION ALL
  SELECT 'W2142' AS dlSku, 'W2142' AS masterCode, 253 AS listPrice
  UNION ALL
  SELECT 'LZS33' AS dlSku, 'LSB33' AS masterCode, 503 AS listPrice
  UNION ALL
  SELECT 'B12' AS dlSku, 'B12' AS masterCode, 223 AS listPrice
  UNION ALL
  SELECT 'LZS3612' AS dlSku, 'LS3612' AS masterCode, 541 AS listPrice
  UNION ALL
  SELECT 'B15' AS dlSku, 'B15' AS masterCode, 254 AS listPrice
  UNION ALL
  SELECT 'OVD338427' AS dlSku, 'O338424' AS masterCode, 938 AS listPrice
  UNION ALL
  SELECT 'W2418' AS dlSku, 'W2418' AS masterCode, 199 AS listPrice
  UNION ALL
  SELECT 'B18' AS dlSku, 'B18' AS masterCode, 268 AS listPrice
  UNION ALL
  SELECT 'OVD339027' AS dlSku, 'O339024' AS masterCode, 976 AS listPrice
  UNION ALL
  SELECT 'B21' AS dlSku, 'B21' AS masterCode, 292 AS listPrice
  UNION ALL
  SELECT 'OVD339627' AS dlSku, 'O339624' AS masterCode, 1017 AS listPrice
  UNION ALL
  SELECT 'W2430' AS dlSku, 'W2430' AS masterCode, 247 AS listPrice
  UNION ALL
  SELECT 'WF3 42' AS dlSku, 'WF342' AS masterCode, 33 AS listPrice
  UNION ALL
  SELECT 'B24' AS dlSku, 'B24' AS masterCode, 332 AS listPrice
  UNION ALL
  SELECT 'W2436' AS dlSku, 'W2436' AS masterCode, 282 AS listPrice
  UNION ALL
  SELECT 'WF6 42' AS dlSku, 'WF642' AS masterCode, 64 AS listPrice
  UNION ALL
  SELECT 'B27' AS dlSku, 'B27' AS masterCode, 360 AS listPrice
  UNION ALL
  SELECT 'W2442' AS dlSku, 'W2442' AS masterCode, 309 AS listPrice
  UNION ALL
  SELECT 'B30' AS dlSku, 'B30' AS masterCode, 373 AS listPrice
  UNION ALL
  SELECT 'B33' AS dlSku, 'B33' AS masterCode, 396 AS listPrice
  UNION ALL
  SELECT 'W2730' AS dlSku, 'W2730' AS masterCode, 256 AS listPrice
  UNION ALL
  SELECT 'B36' AS dlSku, 'B36' AS masterCode, 415 AS listPrice
  UNION ALL
  SELECT 'W2736' AS dlSku, 'W2736' AS masterCode, 293 AS listPrice
  UNION ALL
  SELECT 'B39' AS dlSku, 'B39' AS masterCode, 450 AS listPrice
  UNION ALL
  SELECT 'SB30' AS dlSku, 'SB30' AS masterCode, 328 AS listPrice
  UNION ALL
  SELECT 'W2742' AS dlSku, 'W2742' AS masterCode, 325 AS listPrice
  UNION ALL
  SELECT 'B42' AS dlSku, 'B42' AS masterCode, 489 AS listPrice
  UNION ALL
  SELECT 'SB36' AS dlSku, 'SB36' AS masterCode, 365 AS listPrice
  UNION ALL
  SELECT 'W3012' AS dlSku, 'W3012' AS masterCode, 195 AS listPrice
  UNION ALL
  SELECT 'W3015' AS dlSku, 'W3015' AS masterCode, 211 AS listPrice
  UNION ALL
  SELECT 'W3018' AS dlSku, 'W3018' AS masterCode, 232 AS listPrice
  UNION ALL
  SELECT 'W3024' AS dlSku, 'W3024' AS masterCode, 253 AS listPrice
  UNION ALL
  SELECT 'W3030' AS dlSku, 'W3030' AS masterCode, 277 AS listPrice
  UNION ALL
  SELECT 'BF3' AS dlSku, 'BF3' AS masterCode, 29 AS listPrice
  UNION ALL
  SELECT 'W3036' AS dlSku, 'W3036' AS masterCode, 309 AS listPrice
  UNION ALL
  SELECT 'WP188427' AS dlSku, 'U188424' AS masterCode, 696 AS listPrice
  UNION ALL
  SELECT 'BF6' AS dlSku, 'BF6' AS masterCode, 56 AS listPrice
  UNION ALL
  SELECT 'W3042' AS dlSku, 'W3042' AS masterCode, 338 AS listPrice
  UNION ALL
  SELECT 'WP189027' AS dlSku, 'U189024' AS masterCode, 770 AS listPrice
  UNION ALL
  SELECT 'BMC30' AS dlSku, 'BMC30' AS masterCode, 495 AS listPrice
  UNION ALL
  SELECT 'TK8' AS dlSku, 'TK8(TKC)' AS masterCode, 33 AS listPrice
  UNION ALL
  SELECT 'W3312' AS dlSku, 'W3312' AS masterCode, 204 AS listPrice
  UNION ALL
  SELECT 'WP189627' AS dlSku, 'U189624' AS masterCode, 804 AS listPrice
  UNION ALL
  SELECT 'W3315' AS dlSku, 'W3315' AS masterCode, 224 AS listPrice
  UNION ALL
  SELECT 'WP248427' AS dlSku, 'U248424' AS masterCode, 815 AS listPrice
  UNION ALL
  SELECT 'W3318' AS dlSku, 'W3318' AS masterCode, 243 AS listPrice
  UNION ALL
  SELECT 'WP249027' AS dlSku, 'U249024' AS masterCode, 840 AS listPrice
  UNION ALL
  SELECT 'VAN24' AS dlSku, 'V2421' AS masterCode, 277 AS listPrice
  UNION ALL
  SELECT 'W3324' AS dlSku, 'W3324' AS masterCode, 269 AS listPrice
  UNION ALL
  SELECT 'WP249627' AS dlSku, 'U249624' AS masterCode, 877 AS listPrice
  UNION ALL
  SELECT 'VAN30' AS dlSku, 'V3021' AS masterCode, 332 AS listPrice
  UNION ALL
  SELECT 'W3330' AS dlSku, 'W3330' AS masterCode, 293 AS listPrice
  UNION ALL
  SELECT 'WP308427' AS dlSku, 'U308424' AS masterCode, 1050 AS listPrice
  UNION ALL
  SELECT 'DB12' AS dlSku, '3DB12' AS masterCode, 340 AS listPrice
  UNION ALL
  SELECT 'VAN36DL' AS dlSku, 'V3621DL' AS masterCode, NULL AS listPrice /* Luxe $984 suspected typo - left NULL */
  UNION ALL
  SELECT 'W3336' AS dlSku, 'W3336' AS masterCode, 319 AS listPrice
  UNION ALL
  SELECT 'WP309027' AS dlSku, 'U309024' AS masterCode, 1083 AS listPrice
  UNION ALL
  SELECT 'DB15' AS dlSku, '3DB15' AS masterCode, 358 AS listPrice
  UNION ALL
  SELECT 'VAN36DR' AS dlSku, 'V3621DR' AS masterCode, NULL AS listPrice /* Luxe $984 suspected typo - left NULL */
  UNION ALL
  SELECT 'W3342' AS dlSku, 'W3342' AS masterCode, 351 AS listPrice
  UNION ALL
  SELECT 'WP309627' AS dlSku, 'U309624' AS masterCode, 1115 AS listPrice
  UNION ALL
  SELECT 'DB18' AS dlSku, '3DB18' AS masterCode, 379 AS listPrice
  UNION ALL
  SELECT 'W3612' AS dlSku, 'W3612' AS masterCode, 224 AS listPrice
  UNION ALL
  SELECT 'WRC3018' AS dlSku, 'WRC3018' AS masterCode, 186 AS listPrice
  UNION ALL
  SELECT 'DB21' AS dlSku, '3DB21' AS masterCode, 401 AS listPrice
  UNION ALL
  SELECT 'VDB12' AS dlSku, 'VDB1221(3VDB12)' AS masterCode, 313 AS listPrice
  UNION ALL
  SELECT 'W361227' AS dlSku, 'W361224' AS masterCode, 247 AS listPrice
  UNION ALL
  SELECT 'DB24' AS dlSku, '3DB24' AS masterCode, 441 AS listPrice
  UNION ALL
  SELECT 'VDB15' AS dlSku, 'VDB1521(3VDB15)' AS masterCode, 332 AS listPrice
  UNION ALL
  SELECT 'W3615' AS dlSku, 'W3615' AS masterCode, 244 AS listPrice
  UNION ALL
  SELECT 'DB27' AS dlSku, '3DB27' AS masterCode, 479 AS listPrice
  UNION ALL
  SELECT 'VDB18' AS dlSku, 'VDB1821(3VDB18)' AS masterCode, 351 AS listPrice
  UNION ALL
  SELECT 'W361527' AS dlSku, 'W361524' AS masterCode, 279 AS listPrice
  UNION ALL
  SELECT 'DB30' AS dlSku, '3DB30' AS masterCode, 495 AS listPrice
  UNION ALL
  SELECT 'VDB24' AS dlSku, 'VDB2421' AS masterCode, 408 AS listPrice
  UNION ALL
  SELECT 'W3618' AS dlSku, 'W3618' AS masterCode, 279 AS listPrice
  UNION ALL
  SELECT 'DB33' AS dlSku, '3DB33' AS masterCode, 526 AS listPrice
  UNION ALL
  SELECT 'VSB36' AS dlSku, 'VS36' AS masterCode, 347 AS listPrice
  UNION ALL
  SELECT 'W361827' AS dlSku, 'W361824' AS masterCode, 311 AS listPrice
  UNION ALL
  SELECT 'DB36' AS dlSku, '3DB36' AS masterCode, 550 AS listPrice
  UNION ALL
  SELECT 'W0930' AS dlSku, 'W0930' AS masterCode, 125 AS listPrice
  UNION ALL
  SELECT 'W3624' AS dlSku, 'W3624' AS masterCode, 306 AS listPrice
  UNION ALL
  SELECT 'W0936' AS dlSku, 'W0936' AS masterCode, 145 AS listPrice
  UNION ALL
  SELECT 'W362427' AS dlSku, 'W362424' AS masterCode, 336 AS listPrice
  UNION ALL
  SELECT 'W0942' AS dlSku, 'W0942' AS masterCode, 176 AS listPrice
  UNION ALL
  SELECT 'W3630' AS dlSku, 'W3630' AS masterCode, 338 AS listPrice
  UNION ALL
  SELECT 'W3636' AS dlSku, 'W3636' AS masterCode, 365 AS listPrice
  UNION ALL
  SELECT 'W1230' AS dlSku, 'W1230' AS masterCode, 160 AS listPrice
  UNION ALL
  SELECT 'W3642' AS dlSku, 'W3642' AS masterCode, 412 AS listPrice
  UNION ALL
  SELECT 'W1236' AS dlSku, 'W1236' AS masterCode, 185 AS listPrice
  UNION ALL
  SELECT 'WBC2730' AS dlSku, 'WBC2730' AS masterCode, 237 AS listPrice
  UNION ALL
  SELECT 'W1242' AS dlSku, 'W1242' AS masterCode, 214 AS listPrice
  UNION ALL
  SELECT 'WBC2736' AS dlSku, 'WBC2736' AS masterCode, 272 AS listPrice
  UNION ALL
  SELECT 'WBC2742' AS dlSku, 'WBC2742' AS masterCode, 301 AS listPrice
  UNION ALL
  SELECT 'W1530' AS dlSku, 'W-15-30' AS masterCode, 176 AS listPrice
  UNION ALL
  SELECT 'W1536' AS dlSku, 'W1536' AS masterCode, 199 AS listPrice
  UNION ALL
  SELECT 'WDC243012' AS dlSku, 'WDC2430' AS masterCode, 422 AS listPrice
) m
JOIN cabinet_dealz.cabinets c ON c.masterCode = m.masterCode
JOIN cabinet_dealz.door_styles ds ON ds.styleCode = 'DL-LUXE' AND ds.distributorId = (SELECT id FROM cabinet_dealz.distributors WHERE code = 'DL')
WHERE NOT EXISTS (SELECT 1 FROM cabinet_dealz.distributor_skus x WHERE x.platformSku = CONCAT(m.dlSku, '-LUXE-DL'))
  AND NOT EXISTS (SELECT 1 FROM cabinet_dealz.distributor_skus y WHERE y.distributorId = ds.distributorId AND y.styleId = ds.id AND y.cabinetId = c.id);
