"""Resolve the unmatched DL SKUs (crosswalk rows with matchType 'none' plus the one 'low' row).

Inputs (all in this folder): dl_crosswalk.orig.csv (the merged crosswalk), dl_prices.csv (Price List P5 v1_13_26),
dl_spec_book_items.csv (parsed from DL Specification Book v.11/14/23).
Outputs: dl_crosswalk.csv, dl_unmatched_masters_tidb.sql, dl_unmatched_specs.csv, dl_unmatched_report.csv.
Master catalog reference: data/distributor-connections/cabinet-descriptions-corrected-2026-10-26.xlsx (the live DB
was NOT queried), so every 'matched' master must be confirmed against the live catalog before the SQL is run.
Run: python3 build_unmatched.py
"""
import csv

PRICE = {r["dlSku"]: r for r in csv.DictReader(open("dl_prices.csv"))}
SPEC = {r["dlSku"]: r for r in csv.DictReader(open("dl_spec_book_items.csv"))}
ORIG = list(csv.DictReader(open("dl_crosswalk.orig.csv")))
SB = "DL Specification Book v.11/14/23"
PL = "DL Price List P5 (v1_13_26)"
SHEET = "master description sheet 2026-10-26 (repo xlsx)"

# ---- decisions -----------------------------------------------------------------------------------------------
# MAP: dlSku -> (masterCode, matchType, confidence, reason)
MAP = {}
for w, door in [(18, "single"), (21, "single"), (24, "2-door"), (27, "2-door"), (30, "2-door"), (33, "2-door"), (36, "double-door")]:
    s = SPEC[f"FDB{w}"]
    MAP[f"FDB{w}"] = (f"B{w}FH", "nomenclature-equivalent", "high",
        f"{SB} p.{s['specBookPage']}: FDB = Full Height Door Base ({s['doors']} door, {s['drawers']} drawers, {s['shelves']} shelf, {w} x 34-1/2 x 24); "
        f"master B{w}FH is the {w}\" Full Height {door} door base ({SHEET}). Same type, door count and width. NOTE Tom's brief called FDB 'full-drawer bases'; the spec book says Full Height DOOR Base")
for c in ("W1218", "W1518", "W1818"):
    s = SPEC[c]
    MAP[c] = (c, "exact", "high",
        f"identical code; {SHEET} lists {c} '{c[1:3]}\" x 18\" High Single Door Wall Cabinet' (eligibility CS only). {SB} p.{s['specBookPage']}: {s['widthIn']} x {s['heightIn']} x {s['depthIn']}, {s['doors']} door, {s['shelves']} shelves. Master description has no depth or shelf count: confirm in the live catalog")
MAP["VAN48D-6"] = ("VDDB48", "dimension-equivalent", "high",
    f"{SB} p.{SPEC['VAN48D-6']['specBookPage']}: 48 x 34-1/2 x 21, 2 doors, 6 drawers + 1 false front. VDDB48 (USCD) is 48W x 34-1/2H x 21D, 3 drawers each side (6), 2 centre doors, long false drawer front above. Same type, size, door and drawer counts")
MAP["WMC3018"] = ("PWB-MOS-30-18", "dimension-equivalent", "medium",
    f"{SB}: wall microwave cabinet 30 x 18 x 12, 0 doors, 1 shelf (open). Master is '30 x 18 x 11 7/8 Wall Microwave Open Box' (SK). Same type and construction; depth differs by 1/8 in")
MAP["DWP3"] = ("DWR3", "nomenclature-equivalent", "high",
    f"{SB}: dishwasher panel 3 x 34-1/2 x 24 (Tom confirmed). DWR3 (alias BEP3) is the 3W x 34-1/2H x 24D dishwasher return panel. Identical size and item")
MAP["GH30"] = ("SGH30", "nomenclature-equivalent", "high",
    f"{SB}: glass holder 30 x 1-1/2 x 12 (Tom confirmed). SGH30 is Stem Glass Holder 30W x 1-1/2H x 12D. Identical size and item")
MAP["TOUCHUP KIT"] = ("TUK", "nomenclature-equivalent", "medium", f"{SB}: touch-up kit (paint pen and putty). Master TUK is 'Touch Up Kit'. Same item; no dimensions in the master to compare")
MAP["PAINT"] = ("SPRAYPAINT", "nomenclature-equivalent", "medium", f"{SB}: spray paint 2-1/2 x 8 x 2-1/2. Master SPRAYPAINT is 'Spray Paint Touch-Up'. Same item; the master has no dimensions or color, so DL's color match is not confirmed")
MAP["SCRIBEMOLDING"] = ("SM8", "nomenclature-equivalent", "medium", f"{SB}: scribe molding 96 x 3/4 x 1/4. Master SM8 is 'Scribe Moulding - 96\"'. Same item and length; the master has no profile dimensions")
MAP["RRP27(1.5)"] = ("REPV2796", "dimension-equivalent", "medium", f"{SB}: refrigerator panel 1-1/2 x 96 x 27. Master REPV2796 is 'Refrigerator End Panel - 27\"D x 96\"H' (SK). Same item, height and depth; the master has no thickness")
MAP["FILLER 6X96"] = ("F696", "dimension-equivalent", "high", f"{SB}: filler 6 x 96 x 3/4. Master F696 is '6\" x 96\" Tall Filler' (CS/SK/USCD). Same item and size")

# NEW masters (cabinets). dlSku -> (category, subCategory, placement, cornerType or None, why-no-master)
NEW = {
 "FDB09": ("Base", "Full Height", "base", None, "FDB family maps to B##FH but the master catalog has nothing below B12FH, and FDB09 is not in the spec book (smallest FDB listed is FDB18); size is from the price list only"),
 "W2118": ("Wall", "Wall Cabinet", "wall", None, "no W2118 master (only the glass W2118GD)"),
 "W2412": ("Wall", "Wall Bridge Cabinet", "wall", None, "no W2412 master (only the glass W2412GD)"),
 "W2415": ("Wall", "Wall Bridge Cabinet", "wall", None, "no W2415 master (only the glass W2415GD)"),
 "W2424": ("Wall", "Wall Bridge Cabinet", "wall", None, "no 24x24 wall master (bridge masters start at 30W)"),
 "W2718": ("Wall", "Wall Bridge Cabinet", "wall", None, "no W2718 master (only the glass W2718GD)"),
 "WDC241812": ("Wall", "Diagonal Corner Cabinet", "wall", "diagonal", "diagonal corner wall masters exist only at 30/36/42 high"),
 "BBC33-9": ("Base", "Blind Corner Base", "base", "blind-corner", "blind corner base masters start at BBC36; none at 33"),
 "2DB33": ("Base", "Drawer Base", "base", None, "2-drawer base masters exist at 24/30/36 only"),
 "BES09": ("Base", "Base End Cabinet", "base", None, "only BES12 (12in, 5 shelves, curved) exists; DL BES09 is 9in with 2 shelves"),
 "SP09": ("Base", "Spice Base", "base", None, "SPB9 (SK, '9in Spice Base / Pull-Out') is a possible duplicate, but its door/drawer/shelf counts are not in the master description, so construction cannot be confirmed. REVIEW for duplicate before publishing"),
 "CL156012": ("Tall", "Counter Linen Cabinet", "tall", None, "no linen cabinet master. Category 'Tall' is my classification (60in high)"),
 "DSK2421": ("Base", "Knee Drawer", "base", None, "knee drawer masters differ in size (DKD30 30x5-1/4, VKD36 36x7); none at 24 x 7-1/2 x 21"),
 "DSK3021": ("Base", "Knee Drawer", "base", None, "DKD30 is 30 x 5-1/4 x 21 (height differs); none at 30 x 7-1/2 x 21"),
 "WEOS0930": ("Wall", "Open Shelf", "wall", None, "open end shelf masters are 6in wide (OE630/636/642); DL is 9in"),
 "WEOS0936": ("Wall", "Open Shelf", "wall", None, "open end shelf masters are 6in wide (OE630/636/642); DL is 9in"),
 "WEOS0942": ("Wall", "Open Shelf", "wall", None, "open end shelf masters are 6in wide (OE630/636/642); DL is 9in"),
 "RH36": ("Wall", "Range Hood Cover", "wall", None, "RHF36 (CS) is only a 'Range Hood Front' with no dimensions; DL RH36 is a 36 x 36 x 24 cover box"),
}

# ACCESSORY / report items: dlSku -> (class, proposed handling)
ACC = {}
def acc(skus, cls, handling):
    for s in skus: ACC[s] = (cls, handling)
acc([f"WG{w}{h}" for w in (12, 15, 18) for h in (30, 36, 42)], "glass door only (decision for Tom)",
    "Spec book p.%s 'Glass Door': WG#### are loose glass DOORS (11-11/16 wide x 29-1/2 to 41-1/2 high x 3/4), not cabinets, and the price list says 'door only? unconfirmed'. Tom's brief listed them as cabinets. No cabinet master created. If they are doors, add accessory masters 'Glass Door' per code; if Tom wants glass wall cabinets instead, those already exist as W####GD" % SPEC["WG1230"]["specBookPage"])
acc(["WDCG243012", "WDCG243612", "WDCG244212"], "glass door only (decision for Tom)",
    "Spec book 'Glass Door': 14-5/8 wide diagonal-corner glass doors, door only. Same decision as WG####: accessory masters if doors, otherwise the existing diagonal glass cabinets")
acc(["WDD30", "WDD36", "WDD42"], "decorative door panel",
    "Spec book 'Wall Decorative Door': 11-7/8 wide x 29-1/2/35-1/2/41-1/2 x 3/4 panels, not cabinets. Nearest masters WDEP30/36/42 are 11-1/2 x 29/35/41 (USCD) or 12-3/4 x 29/35/41 (SK): sizes differ, so not mapped. Propose new accessory masters WDD30/36/42")
acc(["BDD24"], "decorative door panel", "Spec book 'Base Decorative Door': 23-3/4 x 29-1/4 x 3/4 flat door panel. Nearest BDEP is 23-1/2 x 29 x 3/4: size differs, not mapped. Propose a new accessory master BDD24")
acc(["WF3 30", "WF3 36"], "filler", "Wall filler 3 x 30/36 x 3/4. Masters exist only at 42 and 96 high (F342, F396). Propose new accessory masters WF3 30 / WF3 36")
acc(["SIDE PANEL 36X96"], "panel", "Side panel 96 x 36 x 1/2. No master with that thickness (SPW is 96 x 36 x 1/4). Propose a new accessory master")
acc(["SKIN PANEL 36X96"], "panel", "Skin panel 96 x 36 x 3/16. No master (SPW 1/4, USV2496 is 23-1/4 wide). Propose a new accessory master")
acc(["FLAT PANEL 28X96"], "panel", "Not in the spec book. The spec book lists FLAT PANEL 27X96 (3/4 x 96 x 27): 28 may be a price list typo. Ask Rich before creating anything")
acc(["BASEMOLDING"], "molding", "96 x 4-3/8 x 3/4 base molding. Furniture base moulding masters (FBM 4-15/16 / 4-1/2) differ. Propose a new accessory master")
acc(["SHOEMOLDING"], "molding", "96 x 1/2 x 1/2. Nearest SHM8 is 3/4 high x 1/2 deep: differs. Propose a new accessory master")
acc(["ICM8"], "molding", "Inside corner molding 96 x 1/2 x 1/2. No master found. Propose a new accessory master")
acc(["ANGLEMOLDING"], "molding", "Angle molding 96 x 3/4 x 3/4. No master found (ACM8 is crown). Propose a new accessory master")
acc(["CCM8"], "molding", "Crown 96 x 3 x 4-1/4 ('8' = 8 ft). Crown masters (LCM8 3-3/8, DCM 3x2) differ. Propose a new accessory master")
acc(["ACM2.5"], "molding", "96 x 2 x 3-1/2 (listed in the crown section). ACM8 masters are 2-1/2 x 2-1/2 or 1-3/4 x 1-13/16: differ. Propose a new accessory master")
acc(["TLR8"], "molding", "Traditional light rail 96 x 1-1/2 x 2-1/4. LRM8 masters are 2-1/4H x 3/4D or 1in: differ. Propose a new accessory master")
acc(["CORBEL 8X12"], "decorative hardware", "Corbel 3 x 12 x 8. CBT 3 x 13-1/16 x 5-7/8 and MCB 3-1/2 x 12 x 9 differ. Propose a new accessory master")
acc(["DLS 4X4X36"], "decorative leg", "Leg post 4 x 34-1/2 x 4. CLDL/SQDL are 3 x 34-1/2 x 3: differ. Propose a new accessory master")
acc([f'PULLOUT TRAY {n}"' for n in (18, 24, 30, 36)], "pullout tray", "Pull-out tray 14/20/26/32 x 4 x 21. Roll-out shelf and tray masters (RS##, UNIV-ROT##) have different sizes. Propose new accessory masters")
acc(["PULLOUT TRAY BWBKT15", "PULLOUT TRAY BWBKT18", "PULLOUT TRAY BWBKT21"], "pullout tray", "Not in the spec book. Tray for the BWBKT waste basket base. No master. List only until Rich confirms size")
acc(['9" DRAWER SLIDES', '12" DRAWER SLIDES', '15" DRAWER SLIDES', '18" DRAWER SLIDES', '21" DRAWER SLIDES'], "drawer slides", "Not in the spec book; no master. Propose accessory masters once Rich confirms what the item is (sold per pair?)")
acc(["TRASH CAN"], "trash can", "Spec book: 14-1/8 x 15-1/2 x 9-15/16. No loose trash can master (B15TCPO etc. are pullout bases). Propose a new accessory master")
acc(["SAMPLE DOOR PACK (2025)"], "sample", "13 x 17 x 7 pack. SAMPLE DOOR / SD masters are single 11 x 15 sample doors. Propose a new accessory master or leave unlisted")
acc([f"WN FS{n}" for n in (3012, 3612, 4812)] + [f"WO FS{n}" for n in (3012, 3612, 4812)], "floating shelf (not in spec book)", "Not in the spec book; WN/WO presumably wood finishes. Floating shelf masters FS30/FS36/FS42/FS48 exist but size and finish are unconfirmed. Ask Rich")

SKIP = {
 "QUARTER DOOR": "not in the spec book, no description. Ask Rich what it is",
 "SP2436": "not in the spec book (the spec lists SP09 only). Ask Rich",
 "BWBKT18": "LOW-confidence candidate BWB18 (SK 18in Base Waste Basket) kept for review. Spec book: BWBKT18 is 18 x 34-1/2 x 24, 0 doors, 2 drawers, trash cans sold separately; BWB18's door/drawer counts are not in the master description. Tom: map to BWB18 or create a new master BWBKT18",
}
CAND = {"BWBKT18": "BWB18"}

targets = [r for r in ORIG if r["matchType"] == "none" or r["confidence"] == "low"]
assert len(targets) == 90, len(targets)
known = set(MAP) | set(NEW) | set(ACC) | set(SKIP)
missing = [r["dlSku"] for r in targets if r["dlSku"] not in known]
extra = [s for s in known if s not in {r["dlSku"] for r in targets}]
assert not missing and not extra, (missing, extra)

# ---- updated crosswalk -----------------------------------------------------------------------------------------
out, report = [], []
for r in ORIG:
    s = r["dlSku"]
    if r not in targets:
        out.append(r)
        continue
    row = dict(r)
    if s in MAP:
        m, mt, cf, why = MAP[s]
        row.update(masterCode=m, matchType=mt, confidence=cf, note=why)
        status = "matched"
    elif s in NEW:
        row.update(masterCode=s, matchType="new-master", confidence="", note=f"NEW master {s} (unpublished, isActive=0, showInDesigner=0): {NEW[s][4]}. Specs: {SB}" if s in SPEC else f"NEW master {s}: {NEW[s][4]}. Specs: {PL} only")
        status = "new master"
    elif s in ACC:
        row.update(masterCode="", matchType="accessory-report", confidence="", note=f"{ACC[s][0]}: {ACC[s][1]}")
        status = "accessory"
    else:
        row.update(masterCode=CAND.get(s, ""), matchType="skipped", confidence="low" if s in CAND else "", note=SKIP[s])
        status = "skipped"
    out.append(row)
    report.append((s, status, row["masterCode"], row["matchType"], row["confidence"], row["note"]))
with open("dl_crosswalk.csv", "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(ORIG[0].keys()), lineterminator="\n")
    w.writeheader(); w.writerows(out)
with open("dl_unmatched_report.csv", "w", newline="") as f:
    w = csv.writer(f, lineterminator="\n"); w.writerow(["dlSku", "status", "masterCode", "matchType", "confidence", "reason"]); w.writerows(report)

# ---- SQL ------------------------------------------------------------------------------------------------------
q = lambda s: "'" + str(s).replace("'", "''") + "'"
def fnum(v):
    return "NULL" if v in ("", None) else repr(float(v)).rstrip("0").rstrip(".") if "." in repr(float(v)) else repr(float(v))
def desc(code):
    s = SPEC.get(code); p = PRICE[code]
    if s:
        kind = s["specSection"].rstrip("s")
        parts = [f'{kind} - {s["widthIn"].rstrip("0").rstrip(".")}"W x {s["heightIn"].rstrip("0").rstrip(".")}"H x {s["depthIn"].rstrip("0").rstrip(".")}"D']
        if s["doors"] != "": parts.append(f'{s["doors"]} door(s)')
        if s["drawers"] != "": parts.append(f'{s["drawers"]} drawer(s)')
        if s["shelves"] != "": parts.append(f'{s["shelves"]} shelf(ves)')
        return ", ".join(parts)
    return f'9" Full Height Door Base Cabinet (size from {PL}; door count and shelves not found in any source)'
L = ["-- DL Cabinetry: NEW masters and pending SKUs for the previously unmatched DL items. PREPARED, NOT RUN. Do not run without Tom's review.",
 f"-- Sources: {SB} (page per item in dl_spec_book_items.csv), {PL}, master description sheet 2026-10-26 (live DB was not queried).",
 "-- Generated by build_unmatched.py. One statement per numbered block. Every statement is guarded (NOT EXISTS) so re-running is safe.",
 "-- New master cabinets are UNPUBLISHED: isActive = FALSE, showInDesigner = FALSE, showInCatalog = FALSE, showIn2020 = FALSE. Nothing here makes any master visible.",
 "-- DL is live and its existing SKUs are published. Every distributor_skus row below is isPublished = FALSE, status = 'pending' and stays that way until Tom publishes it.",
 "-- BEFORE running: confirm in the live database that none of the NEW master codes already exists under another code (see SP09 note), and that each MAPPED master exists.",
 "-- Not covered here (see findings.md): accessories, glass doors, and the skipped items.", ""]
b = 0
for code, (cat, sub, place, corner, why) in NEW.items():
    b += 1
    s = SPEC.get(code); p = PRICE[code]
    W, H, D = (s["widthIn"], s["heightIn"], s["depthIn"]) if s else (p["width"], p["height"], p["depth"])
    doors = s["doors"] if s and s["doors"] != "" else None
    dr = s["drawers"].split()[0] if s and s["drawers"] != "" else None
    src = f'{SB} p.{s["specBookPage"]}' if s else f"{PL} row {code} only"
    L += [f"-- Block {b}: NEW master {code} ({why}). Source: {src}. Any door/drawer count not in the source is NULL.",
          "INSERT INTO cabinet_dealz.cabinets (masterCode, description, descriptionSource, category, subCategory, width, height, depth, placementType, numberOfDoors, numberOfDrawers, isCornerCabinet, cornerType, isActive, showInDesigner, showInCatalog, showIn2020, isNotCabinet)",
          f"SELECT {q(code)}, {q(desc(code))}, {q('DL Cabinetry spec book v.11/14/23' if s else 'DL Price List P5 v1_13_26')}, {q(cat)}, {q(sub)}, {float(W):g}, {float(H):g}, {float(D):g}, {q(place)}, {doors if doors is not None else 'NULL'}, {dr if dr is not None else 'NULL'}, {'TRUE' if corner else 'FALSE'}, {q(corner) if corner else 'NULL'}, FALSE, FALSE, FALSE, FALSE, FALSE",
          f"FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM cabinet_dealz.cabinets WHERE masterCode = {q(code)})",
          f"  AND NOT EXISTS (SELECT 1 FROM cabinet_dealz.cabinet_aliases WHERE alias = {q(code)});", ""]
b += 1
L += [f"-- Block {b}: alias = the DL code for every new master (supplier code becomes the master's code and alias)",
      "INSERT INTO cabinet_dealz.cabinet_aliases (cabinetId, alias)",
      "SELECT c.id, a.alias FROM (",
      "\n  UNION ALL\n".join(f"  SELECT {q(c)} AS alias" for c in NEW) + "\n) a",
      "JOIN cabinet_dealz.cabinets c ON c.masterCode = a.alias",
      "WHERE NOT EXISTS (SELECT 1 FROM cabinet_dealz.cabinet_aliases x WHERE x.alias = a.alias);", ""]
STY = [("DL-WS", "WS", "core"), ("DL-SSA", "SSA", "slim"), ("DL-SSE", "SSE", "slim"), ("DL-LUXE-TBD", "LUXE-TBD", "luxe")]
sku_master = {s: v[0] for s, v in MAP.items()}
sku_master.update({s: s for s in NEW})
for sc, nm, col in STY:
    b += 1
    rows = []
    for s, m in sku_master.items():
        price = PRICE[s][col].strip()
        if not price: continue
        rows.append(f"  SELECT {q(s)} AS dlSku, {q(m)} AS masterCode, {price} AS listPrice")
    L += [f"-- Block {b}: distributor_skus for door style {sc} using the {col.upper()} price column ({len(rows)} SKUs; pending, unpublished)",
      "INSERT INTO cabinet_dealz.distributor_skus (cabinetId, distributorId, styleId, platformSku, distributorSku, constructionType, listPrice, isPublished, status, supplierCabinetName)",
      f"SELECT c.id, ds.distributorId, ds.id, CONCAT(m.dlSku, '-{nm}-DL'), m.dlSku, 'framed', m.listPrice, FALSE, 'pending', m.dlSku",
      "FROM (\n" + "\n  UNION ALL\n".join(rows) + "\n) m",
      "JOIN cabinet_dealz.cabinets c ON c.masterCode = m.masterCode",
      f"JOIN cabinet_dealz.door_styles ds ON ds.styleCode = '{sc}' AND ds.distributorId = (SELECT id FROM cabinet_dealz.distributors WHERE code = 'DL')",
      f"WHERE NOT EXISTS (SELECT 1 FROM cabinet_dealz.distributor_skus x WHERE x.platformSku = CONCAT(m.dlSku, '-{nm}-DL'))",
      "  AND NOT EXISTS (SELECT 1 FROM cabinet_dealz.distributor_skus y WHERE y.distributorId = ds.distributorId AND y.styleId = ds.id AND y.cabinetId = c.id);", ""]
b += 1
L += [f"-- Block {b}: read-only check. Expect new_masters = {len(NEW)}, new_masters_hidden = {len(NEW)}, new_pending_skus = the sum of the SKU blocks above, new_published = 0.",
 "SELECT",
 f"  (SELECT COUNT(*) FROM cabinet_dealz.cabinets WHERE masterCode IN ({', '.join(q(c) for c in NEW)})) AS new_masters,",
 f"  (SELECT COUNT(*) FROM cabinet_dealz.cabinets WHERE masterCode IN ({', '.join(q(c) for c in NEW)}) AND isActive = 0 AND showInDesigner = 0) AS new_masters_hidden,",
 "  (SELECT COUNT(*) FROM cabinet_dealz.distributor_skus WHERE platformSku LIKE '%-DL' AND isPublished = 0 AND status = 'pending') AS dl_pending_skus,",
 "  (SELECT COUNT(*) FROM cabinet_dealz.distributor_skus WHERE platformSku LIKE '%-DL' AND isPublished = 1) AS dl_published_skus;", ""]
open("dl_unmatched_masters_tidb.sql", "w").write("\n".join(L))

# ---- per-value specs for the new masters ----------------------------------------------------------------------
with open("dl_unmatched_specs.csv", "w", newline="") as f:
    w = csv.writer(f, lineterminator="\n")
    w.writerow(["masterCode", "field", "value", "source", "note"])
    for code, (cat, sub, place, corner, why) in NEW.items():
        s = SPEC.get(code); p = PRICE[code]
        src = f'{SB} p.{s["specBookPage"]}' if s else f"{PL} row {code}"
        vals = [("width_in", s["widthIn"] if s else p["width"]), ("height_in", s["heightIn"] if s else p["height"]), ("depth_in", s["depthIn"] if s else p["depth"]),
                ("doors", s["doors"] if s else ""), ("drawers", s["drawers"] if s else ""), ("shelves", s["shelves"] if s else "")]
        for k, v in vals:
            w.writerow([code, k, v if v != "" else "NULL", src if v != "" else "not found", "" if v != "" else "not in any source: left NULL"])
        for k in ("door_sizes", "drawer_sizes", "construction", "materials", "hardware", "finish", "package_length", "package_width", "package_height", "package_weight_lb"):
            w.writerow([code, k, "NULL", "not found", "not in the spec book or price list" + ("; weight/cube rule: DL-written first, then master, then similar SKU/research (not implemented, held for Tom)" if k.startswith("package") else "")])
        w.writerow([code, "photo", "NULL", "none", "photo source order: master/reference image first (none exists for a new master), then DL's spec book image; not extracted or uploaded"])
        w.writerow([code, "category/subCategory/placement", f"{cat} / {sub} / {place}", "classification (mine)", why])
print("mapped", len(MAP), "new", len(NEW), "accessory", len(ACC), "skipped", len(SKIP), "blocks", b)
