import csv
xw={r['dlSku']:r for r in csv.DictReader(open('dl_crosswalk.csv'))}
pr={r['dlSku']:r for r in csv.DictReader(open('dl_prices.csv'))}
sk=[k for k,r in xw.items() if r['matchType']!='none' and r['confidence'] in('high','medium') and k!='SAMPLE DOOR']
q=lambda s:"'"+s.replace("'","''")+"'"
D="(SELECT id FROM cabinet_dealz.distributors WHERE code = 'DL')"
L=["-- DL Cabinetry distributor setup for TiDB -- PREPARED, NOT APPLIED. Do not run without Tom's review.",
"-- Source: DL 'Price List - P5 (v1_13_26)' from Rich (received 2026-10-09). Prices are DL published Core/Slim/Luxe list prices.",
"-- Idempotent: every block is a single INSERT ... SELECT ... WHERE NOT EXISTS.",
"-- !!! BLOCKED until Rich confirms whether P5 prices are list or dealer cost, and the dealer discount !!!\n-- PLACEHOLDERS: costMultiplier/baseMultiplier/freightMultiplier are UNKNOWN (DL dealer discount + freight not provided).",
"--   costMultiplier = 1.0000 / baseMultiplier = 1.0000 / freightMultiplier = 0.0000 are PLACEHOLDERS -> confirm before isActive = 1.",
"-- Line ships OFF: distributors.isActive = 0 (Offline in Admin > Distributors); every SKU isPublished = 0, status = 'pending'.",""]
b=1
L+=[f"-- Block {b}: distributor row (white-labeled, offline)",
"INSERT INTO cabinet_dealz.distributors (code, name, initials, brandName, brandInitials, whiteLabel, displayMode, costMultiplier, baseMultiplier, freightMultiplier, retailPriceBasis, warehouseName, isActive)",
"SELECT 'DL', 'Line DL', 'DL', 'DL Cabinetry', 'DL', TRUE, 'neutral', 1.0000 /* PLACEHOLDER - BLOCKED until Rich confirms */, 1.0000 /* PLACEHOLDER - BLOCKED */, 0.0000 /* PLACEHOLDER - BLOCKED */, 'cost_plus_tier', 'DL Cabinetry (Austin/Jacksonville/Nashville/New Orleans/Orlando/Tampa) - origin ZIPs TBD', 0",
"FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM cabinet_dealz.distributors WHERE code = 'DL');",""]
U='https://www.dlcabinetry.com/'
# (styleCode, DL name, line, column or None, doorStyle, basis/source)
STY=[('DL-WS','White Shaker','Core','core','Shaker',"Tom 2026-10-30: Core = white shaker baseline; "+U+"white-shaker-gallery"),
 ('DL-SSA','Slim Shaker Alabaster','Slim (INFERRED from name, unconfirmed)','slim','Slim Shaker',U+"slim-shaker-alabaster-gallery"),
 ('DL-SSE','Slim Shaker Ebony','Slim (INFERRED from name, unconfirmed)','slim','Slim Shaker',U+"slim-shaker-ebony-gallery"),
 ('DL-LUXE-TBD','DL Luxe (PLACEHOLDER - no door style identified)','Luxe','luxe',None,'no public source names a Luxe door')]
for code,nm,slug in [('VS','Versa Shaker','versa-shaker'),('PW','Pearl White','pearl-white'),('GW','Glacier White','glacier-white'),('EWO','European White Oak','european-white-oak'),('DW','Driftwood','driftwood'),('DG','Dove Grey','dove-grey'),('DC','Dark Caramel','dark-caramel'),('CG','Cyber Grey','cyber-grey'),('CM','Champagne Mist','champagne-mist'),('MC','Midnight Cove','midnight-cove')]:
  STY.append(('DL-'+code,nm,'LINE UNKNOWN',None,None,U+slug+'-gallery'))
for sc,nm,line,col,ds,src in STY:
  b+=1
  L+=[f"-- Block {b}: door style {nm} [{sc}] - line: {line}" + ("" if col else " -> NO SKUs generated until Rich confirms the line"),
  f"--   source: {src}",
  "INSERT INTO cabinet_dealz.door_styles (distributorId, styleCode, ourName, distributorName, doorStyle, boxConstruction, isActive)",
  f"SELECT d.id, '{sc}', {q(nm)}, {q(nm)}, {q(ds) if ds else 'NULL'}, 'Framed plywood RTA', FALSE FROM cabinet_dealz.distributors d",
  f"WHERE d.code = 'DL' AND NOT EXISTS (SELECT 1 FROM cabinet_dealz.door_styles s WHERE s.distributorId = d.id AND s.styleCode = '{sc}');",""]
tiers=[(sc,col,sc[3:]) for sc,nm,line,col,ds,src in STY if col]
for sc,col,nm in tiers:
  b+=1
  vals=[]
  for k in sk:
    p=pr[k][col]; note=''
    if k.startswith('VAN36') and col=='luxe': p='NULL'; note=' /* Luxe $984 suspected typo - left NULL */'
    vals.append(f"  SELECT {q(k)} AS dlSku, {q(xw[k]['masterCode'])} AS masterCode, {p} AS listPrice{note}")
  L+=[f"-- Block {b}: distributor_skus for door style {sc} using the {col.upper()} price column ({len(sk)} mapped SKUs, high/medium confidence; unpublished, pending)",
  "INSERT INTO cabinet_dealz.distributor_skus (cabinetId, distributorId, styleId, platformSku, distributorSku, constructionType, listPrice, isPublished, status, supplierCabinetName)",
  f"SELECT c.id, ds.distributorId, ds.id, CONCAT(m.dlSku, '-{nm.upper()}-DL'), m.dlSku, 'framed', m.listPrice, FALSE, 'pending', m.dlSku",
  "FROM (\n"+"\n  UNION ALL\n".join(vals)+"\n) m",
  "JOIN cabinet_dealz.cabinets c ON c.masterCode = m.masterCode",
  f"JOIN cabinet_dealz.door_styles ds ON ds.styleCode = '{sc}' AND ds.distributorId = {D}",
  f"WHERE NOT EXISTS (SELECT 1 FROM cabinet_dealz.distributor_skus x WHERE x.platformSku = CONCAT(m.dlSku, '-{nm.upper()}-DL'))",
  "  AND NOT EXISTS (SELECT 1 FROM cabinet_dealz.distributor_skus y WHERE y.distributorId = ds.distributorId AND y.styleId = ds.id AND y.cabinetId = c.id);",""]
open('dl_distributor_setup_tidb.sql','w').write('\n'.join(L))
print(len(sk),b)
