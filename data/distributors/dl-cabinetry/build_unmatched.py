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
# glass door SKU -> plain cabinet SKU whose price is added (SKU price = cabinet + glass door, never door-only)
GLASS_PLAIN = {f"WG{w}{h}": f"W{w}{h}" for w in (12, 15, 18) for h in (30, 36, 42)}
GLASS_PLAIN.update({"WDCG243012": "WDC243012", "WDCG243612": "WDC243612", "WDCG244212": "WDC244212"})
GLASS_MASTER = {}  # filled below: glass SKU -> master code
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

MAP["SP09"] = ("SPB9", "alias", "high", "Tom confirmed SP09 = SPB9, the same item (trash can pull-out base; every supplier carries it). Alias SP09 -> SPB9, no new master. Duplicate resolved this way. NOTE: the master sheet words SPB9 as 9in Spice Base / Pull-Out; spec book SP09 = 9 x 34-1/2 x 24, 1 drawer, 3 shelves")
MAP["BWBKT18"] = ("BWB18", "alias", "high", "Tom confirmed BWBKT18 = BWB18, the same cabinet (18in Base Waste Basket, SK). Alias BWBKT18 -> BWB18. Spec book: 18 x 34-1/2 x 24, 0 doors, 2 drawers, trash cans sold separately")
MAP["2DB33"] = ("B33", "alias", "high",
    f"Tom confirmed Oct 31, common B33 (every distributor carries it; two doors, two side-by-side drawers). Alias 2DB33 -> B33 with DL SKU rows under B33. REVIEW: {SB} p.{SPEC['2DB33']['specBookPage']} lists 2DB33 as a Drawer Base (0 doors, 2 drawers) while DL's own B33 is 2 doors, 2 drawers, 1 shelf, and DL prices them differently (2DB33 $263 vs B33 $198 core). DL's B33 SKU already exists on this master, so this adds a SECOND DL SKU on B33")
ALIASES_FOR_MAPPED = {"SP09": "SPB9", "BWBKT18": "BWB18", "2DB33": "B33"}

# NEW masters (keys are MASTER codes; NEW_DL maps master -> DL SKU that creates it; NEW_X holds explicit values)
NEW_DL = {}
NEW_X = {}
for h, shelves in (("30", 2), ("36", 2), ("42", 3)):
    gm = f"W12{h}GD"
    GLASS_MASTER[f"WG12{h}"] = gm
    NEW_DL[gm] = f"WG12{h}"
    NEW_X[gm] = dict(
        desc=f'Wall cabinet Single Glass door - 12"W x {h}"H x 12"D, 1 door, {shelves} shelves (DL W12{h} cabinet + WG12{h} glass door)',
        W=12, H=int(h), D=12, doors=1, drawers=None, isNot=False, specNotes=None, descSrc="DL spec book v.11/14/23 (W12%s p.%s; WG12%s p.%s)" % (h, SPEC[f"W12{h}"]["specBookPage"], h, SPEC[f"WG12{h}"]["specBookPage"]),
        src=f"{SB} W12{h} p.{SPEC[f'W12{h}']['specBookPage']} (1 door, {shelves} shelves) + WG12{h} p.{SPEC[f'WG12{h}']['specBookPage']} (glass door 11-11/16 x {SPEC[f'WG12{h}']['heightIn']} x 3/4); {PL}",
        alias=f"WG12{h}")
# (cabinets). dlSku -> (category, subCategory, placement, cornerType or None, why-no-master)
NEW = {
 "W1230GD": ("Wall", "Wall Cabinet With Glass Door", "wall", None, "Tom approved Oct 31: no 12-wide W12{30,36,42}GD master exists (12-wide glass cabinets exist only at 12 high). Priced as plain W1230 + glass door WG1230. If a master already exists under this code the NOT EXISTS guard skips the insert and the SKUs attach to it"),
 "W1236GD": ("Wall", "Wall Cabinet With Glass Door", "wall", None, "Tom approved Oct 31 (see W1230GD). Priced as W1236 + WG1236"),
 "W1242GD": ("Wall", "Wall Cabinet With Glass Door", "wall", None, "Tom approved Oct 31 (see W1230GD). Priced as W1242 + WG1242"),
 "FLAT PANEL 28X96": ("Panels", "Flat Panel", "accessory", None, "Tom Oct 31: 28 x 96 flat panel CUT DOWN ON THE JOB SITE. No existing panel master matches (nearest 3/4 in panels FPL2496 / FPL3796 are 96 x 24-3/8 / 37-3/8; the spec book lists FLAT PANEL 27X96, 3/4 thick). Modeled like the existing panels / filler accessories"),
 "FDB09": ("Base", "Full Height", "base", None, "FDB family maps to B##FH but the master catalog has nothing below B12FH, and FDB09 is not in the spec book (smallest FDB listed is FDB18); size is from the price list only"),
 "W2118": ("Wall", "Wall Cabinet", "wall", None, "no W2118 master (only the glass W2118GD)"),
 "W2412": ("Wall", "Wall Bridge Cabinet", "wall", None, "no W2412 master (only the glass W2412GD)"),
 "W2415": ("Wall", "Wall Bridge Cabinet", "wall", None, "no W2415 master (only the glass W2415GD)"),
 "W2424": ("Wall", "Wall Bridge Cabinet", "wall", None, "no 24x24 wall master (bridge masters start at 30W)"),
 "W2718": ("Wall", "Wall Bridge Cabinet", "wall", None, "no W2718 master (only the glass W2718GD)"),
 "WDC241812": ("Wall", "Diagonal Corner Cabinet", "wall", "diagonal", "diagonal corner wall masters exist only at 30/36/42 high"),
 "BBC33-9": ("Base", "Blind Corner Base", "base", "blind-corner", "blind corner base masters start at BBC36; none at 33"),
 "BES09": ("Base", "Base End Cabinet", "base", None, "only BES12 (12in, 5 shelves, curved) exists; DL BES09 is 9in with 2 shelves"),
 "CL156012": ("Tall", "Counter Linen Cabinet", "tall", None, "no linen cabinet master. Category 'Tall' is my classification (60in high)"),
 "DSK2421": ("Base", "Knee Drawer", "base", None, "knee drawer masters differ in size (DKD30 30x5-1/4, VKD36 36x7); none at 24 x 7-1/2 x 21"),
 "DSK3021": ("Base", "Knee Drawer", "base", None, "DKD30 is 30 x 5-1/4 x 21 (height differs); none at 30 x 7-1/2 x 21"),
 "WEOS0930": ("Wall", "Open Shelf", "wall", None, "open end shelf masters are 6in wide (OE630/636/642); DL is 9in"),
 "WEOS0936": ("Wall", "Open Shelf", "wall", None, "open end shelf masters are 6in wide (OE630/636/642); DL is 9in"),
 "WEOS0942": ("Wall", "Open Shelf", "wall", None, "open end shelf masters are 6in wide (OE630/636/642); DL is 9in"),
 "RH36": ("Wall", "Range Hood Front", "wall", None, "CABINET (isNotCabinet=FALSE), same as RHF30/RHF36. Compared to RHF36 per Tom (36 W x 23.5 H x 8 D): DL RH36 is 36 x 36 x 24 (spec book Range Hood Cover), so height (36 vs 23.5) and depth (24 vs 8) do NOT match; kept as a hidden new master, not aliased"),
}

# ACCESSORY / report items: dlSku -> (class, proposed handling)
ACC = {}
def acc(skus, cls, handling):
    for s in skus: ACC[s] = (cls, handling)
for w in (15, 18):
    for h in (30, 36, 42):
        MAP[f"WG{w}{h}"] = (f"W{w}{h}GD", "nomenclature-equivalent", "high",
            f"Tom confirmed Oct 31, 2026: WG{w}{h} is the glass DOOR only, not a cabinet; maps to the existing W{w}{h}GD. {SB} p.{SPEC[f'WG{w}{h}']['specBookPage']}: loose glass door {SPEC[f'WG{w}{h}']['widthIn']} wide x {SPEC[f'WG{w}{h}']['heightIn']} high x 3/4. SKU price = plain W{w}{h} + WG{w}{h} per tier (dl_unmatched_glass_pricing.csv), never the door-only price")
for s, m in (("WDCG243012", "DCW2430GD"), ("WDCG243612", "DCW2436GD"), ("WDCG244212", "DCW2442GD")):
    MAP[s] = (m, "nomenclature-equivalent", "high",
        f"Tom confirmed Oct 31, 2026: {s} -> {m}. {s} is the diagonal-corner glass door ({SB} p.{SPEC[s]['specBookPage']}); {m} is the existing diagonal corner glass door cabinet (24W x {s[6:8]}H x 12D). SKU price = plain {GLASS_PLAIN[s]} + {s} per tier (dl_unmatched_glass_pricing.csv)")
acc(["WDD30", "WDD36", "WDD42"], "decorative door panel",
    "Spec book 'Wall Decorative Door': 11-7/8 wide x 29-1/2/35-1/2/41-1/2 x 3/4 panels, not cabinets. Nearest masters WDEP30/36/42 are 11-1/2 x 29/35/41 (USCD) or 12-3/4 x 29/35/41 (SK): sizes differ, so not mapped. Propose new accessory masters WDD30/36/42")
acc(["BDD24"], "decorative door panel", "Spec book 'Base Decorative Door': 23-3/4 x 29-1/4 x 3/4 flat door panel. Nearest BDEP is 23-1/2 x 29 x 3/4: size differs, not mapped. Propose a new accessory master BDD24")
acc(["WF3 30", "WF3 36"], "filler", "Wall filler 3 x 30/36 x 3/4. Masters exist only at 42 and 96 high (F342, F396). Propose new accessory masters WF3 30 / WF3 36")
acc(["SIDE PANEL 36X96"], "panel", "Side panel 96 x 36 x 1/2. No master with that thickness (SPW is 96 x 36 x 1/4). Propose a new accessory master")
acc(["SKIN PANEL 36X96"], "panel", "Skin panel 96 x 36 x 3/16. No master (SPW 1/4, USV2496 is 23-1/4 wide). Propose a new accessory master")
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

acc(["SP2436"], "panel (no spec-book entry)", "Tom Oct 31: SP2436 is a PANEL, not a door, not a cabinet, not a new master. Spec-book lookup (pdftotext of v.11/14/23, searched 'SP2436', 'SP 2436', '2436'): NOT FOUND; only W2436 and WDC243612 contain the digits. So no description, dimensions, thickness, finish or page exist to match. Price list row only: core $33 / slim $33 / luxe $66, no dimensions ('non-door item'). No panel master can be matched without specs and none is created. Needs DL's description from Rich, then alias to the matching panel master")
SKIP = {
 "QUARTER DOOR": "not in the spec book, no description. Ask Rich what it is",
 }
CAND = {}

NEW_X["FLAT PANEL 28X96"] = dict(
    desc='Flat Panel - 28"W x 96"H x 3/4" thick. Field cut: panel is cut to fit on site by installer.',
    W=28, H=96, D=0.75, doors=0, drawers=0, isNot=True,
    specNotes="Field cut — panel is cut to fit on site by installer.",
    descSrc="DL Price List P5 v1_13_26 (28 x 96) + spec book FLAT PANEL 27X96 thickness",
    src=f"{PL} row FLAT PANEL 28X96 (28 x 96, core $64 / slim $64 / luxe $127); thickness 3/4 from {SB} p.13 FLAT PANEL 27X96 (the 28 wide size itself is not in the spec book; finish is not stated there). Tom Oct 31: 28 x 96, cut down on the job site",
    alias=None)
NEW_MASTER_OF = {NEW_DL.get(m, m): m for m in NEW}   # DL sku -> master code
NEW_MASTER_OF["FLAT PANEL 28X96"] = "FLAT PANEL 28X96"
DLSET_NEW = set(NEW_MASTER_OF)

targets = [r for r in ORIG if r["matchType"] == "none" or r["confidence"] == "low"]
assert len(targets) == 90, len(targets)
known = set(MAP) | DLSET_NEW | set(ACC) | set(SKIP)
missing = [r["dlSku"] for r in targets if r["dlSku"] not in known]
extra = [s for s in known if s not in {r["dlSku"] for r in targets}]
assert not missing and not extra, (missing, extra)
assert len(MAP) + len(DLSET_NEW) + len(ACC) + len(SKIP) == 90

def src_of(s, status):
    sp = SPEC.get(s) or SPEC.get(GLASS_PLAIN.get(s, ""), None)
    parts = []
    if s in SPEC: parts.append(f"{SB} p.{SPEC[s]['specBookPage']}")
    else: parts.append(f"{SB}: no entry for {s}")
    parts.append(f"{PL} row {s}")
    if status == "matched": parts.append(SHEET)
    return "; ".join(parts)

# ---- updated crosswalk ---------------------------------------------------------------------------------------
out, report = [], []
for r in ORIG:
    s = r["dlSku"]
    if r not in targets:
        out.append(r); continue
    row = dict(r)
    if s in MAP:
        m, mt, cf, why = MAP[s]
        row.update(masterCode=m, matchType=mt, confidence=cf, note=why)
        status = "aliased" if mt == "alias" else "mapped"
    elif s in DLSET_NEW:
        m = NEW_MASTER_OF[s]
        why = NEW[m][4]
        row.update(masterCode=m, matchType="new-master", confidence="", note=f"NEW hidden master {m}: {why}. Source: " + (NEW_X[m]["src"] if m in NEW_X else (f"{SB} p.{SPEC[s]['specBookPage']}" if s in SPEC else f"{PL} only")))
        status = "new master"
    elif s in ACC:
        row.update(masterCode="", matchType="accessory-report", confidence="", note=f"{ACC[s][0]}: {ACC[s][1]}")
        status = "report-only"
    else:
        row.update(masterCode="", matchType="skipped", confidence="", note=SKIP[s])
        status = "skipped"
    out.append(row)
    report.append((s, status, row["masterCode"], row["matchType"], row["confidence"], row["note"], src_of(s, "matched" if status in ("mapped", "aliased") else status)))
with open("dl_crosswalk.csv", "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(ORIG[0].keys()), lineterminator="\n")
    w.writeheader(); w.writerows(out)
with open("dl_unmatched_report.csv", "w", newline="") as f:
    w = csv.writer(f, lineterminator="\n"); w.writerow(["dlSku", "status", "masterCode", "matchType", "confidence", "reason", "source"]); w.writerows(report)

# ---- SQL ------------------------------------------------------------------------------------------------------
q = lambda s: "'" + str(s).replace("'", "''") + "'"
def g(v):
    return f"{float(v):g}"
def desc(code):
    s = SPEC.get(code)
    if s:
        kind = s["specSection"].rstrip("s")
        parts = [f'{kind} - {s["widthIn"].rstrip("0").rstrip(".")}"W x {s["heightIn"].rstrip("0").rstrip(".")}"H x {s["depthIn"].rstrip("0").rstrip(".")}"D']
        if s["doors"] != "": parts.append(f'{s["doors"]} door(s)')
        if s["drawers"] != "": parts.append(f'{s["drawers"]} drawer(s)')
        if s["shelves"] != "": parts.append(f'{s["shelves"]} shelf(ves)')
        return ", ".join(parts)
    return f'9" Full Height Door Base Cabinet (size from {PL}; door count and shelves not found in any source)'

STY = [("DL-WS", "WS", "core"), ("DL-SSA", "SSA", "slim"), ("DL-SSE", "SSE", "slim"), ("DL-LUXE-TBD", "LUXE-TBD", "luxe")]
sku_master = {s: v[0] for s, v in MAP.items()}
sku_master.update(NEW_MASTER_OF)
def sku_price(s, col):
    """Returns (listPrice, distributorSku, comment). Glass items are priced cabinet + door, never door only."""
    if s in GLASS_PLAIN:
        base = GLASS_PLAIN[s]
        cp, dp = int(PRICE[base][col]), int(PRICE[s][col])
        return cp + dp, f"{base} + {s}", f"{base} {cp} + {s} {dp}"
    return int(PRICE[s][col]), s, f"{s} {PRICE[s][col]}"

L = ["-- DL Cabinetry: NEW masters and pending SKUs for the previously unmatched DL items. PREPARED, NOT RUN. Do not run without Tom's review.",
 f"-- Sources: {SB} (page per item in dl_spec_book_items.csv), {PL}, master description sheet 2026-10-26 (live DB was not queried). Decisions: Tom, Oct 31, 2026.",
 "-- Generated by build_unmatched.py. One statement per numbered block. Every statement is guarded (NOT EXISTS on masterCode / alias / platformSku) so re-running is safe.",
 "-- New master cabinets are HIDDEN: isActive = FALSE, showInDesigner = FALSE, showInCatalog = FALSE, showIn2020 = FALSE. Nothing here makes any master visible.",
 "-- DL is live and its existing SKUs are published. Every distributor_skus row below is isPublished = FALSE, status = 'pending' and stays that way until Tom publishes it.",
 "-- Glass items (W####GD, DCW####GD, new W12##GD): listPrice = plain cabinet price + glass door price per tier, NEVER the door-only price. Both source rows are in each row's comment and in dl_unmatched_glass_pricing.csv.",
 "-- BEFORE running: confirm in the live database that none of the NEW master codes already exists under another code, and that each MAPPED master exists.",
 "-- Not covered here (see findings_unmatched.md): accessories / trim, SP2436 (no spec-book entry), QUARTER DOOR (pending Rich).", ""]
b = 0
for code, (cat, sub, place, corner, why) in NEW.items():
    b += 1
    x = NEW_X.get(code)
    dl = NEW_DL.get(code, code)
    s = SPEC.get(code)
    if x:
        W, H, D, doors, dr = x["W"], x["H"], x["D"], x["doors"], x["drawers"]
        d, dsrc, src, notes, isnot = x["desc"], x["descSrc"], x["src"], x["specNotes"], x["isNot"]
    else:
        p = PRICE[code]
        W, H, D = (s["widthIn"], s["heightIn"], s["depthIn"]) if s else (p["width"], p["height"], p["depth"])
        doors = int(s["doors"]) if s and s["doors"] != "" else None
        dr = int(s["drawers"].split()[0]) if s and s["drawers"] != "" else None
        d, dsrc = desc(code), ("DL Cabinetry spec book v.11/14/23" if s else "DL Price List P5 v1_13_26")
        src = f'{SB} p.{s["specBookPage"]}' if s else f"{PL} row {code} only"
        notes, isnot = None, False
    n = lambda v: "NULL" if v is None else str(v)
    L += [f"-- Block {b}: NEW hidden master {code} ({why}). Source: {src}. Any value not in the source is NULL.",
          "INSERT INTO cabinet_dealz.cabinets (masterCode, description, descriptionSource, category, subCategory, width, height, depth, placementType, numberOfDoors, numberOfDrawers, isCornerCabinet, cornerType, isActive, showInDesigner, showInCatalog, showIn2020, isNotCabinet, specNotes)",
          f"SELECT {q(code)}, {q(d)}, {q(dsrc)}, {q(cat)}, {q(sub)}, {g(W)}, {g(H)}, {g(D)}, {q(place)}, {n(doors)}, {n(dr)}, {'TRUE' if corner else 'FALSE'}, {q(corner) if corner else 'NULL'}, FALSE, FALSE, FALSE, FALSE, {'TRUE' if isnot else 'FALSE'}, {q(notes) if notes else 'NULL'}",
          f"FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM cabinet_dealz.cabinets WHERE masterCode = {q(code)})",
          f"  AND NOT EXISTS (SELECT 1 FROM cabinet_dealz.cabinet_aliases WHERE alias = {q(code)});", ""]
# alias pairs for new masters: the master code itself, plus the DL code when it differs (W1230GD <- WG1230)
pairs = []
for code in NEW:
    pairs.append((code, code))
    dl = NEW_DL.get(code)
    if dl and dl != code: pairs.append((dl, code))
b += 1
L += [f"-- Block {b}: aliases for every new master (the DL code is the alias; for W12##GD the alias WG12## points at the new glass cabinet)",
      "INSERT INTO cabinet_dealz.cabinet_aliases (cabinetId, alias)",
      "SELECT c.id, a.alias FROM (",
      "\n  UNION ALL\n".join(f"  SELECT {q(a)} AS alias, {q(m)} AS masterCode" for a, m in pairs) + "\n) a",
      "JOIN cabinet_dealz.cabinets c ON c.masterCode = a.masterCode",
      "WHERE NOT EXISTS (SELECT 1 FROM cabinet_dealz.cabinet_aliases x WHERE x.alias = a.alias);", ""]
b += 1
L += [f"-- Block {b}: Tom-confirmed aliases on EXISTING masters (SP09 -> SPB9, BWBKT18 -> BWB18, 2DB33 -> B33). Skipped if the alias already exists or the master is missing.",
      "INSERT INTO cabinet_dealz.cabinet_aliases (cabinetId, alias)",
      "SELECT c.id, a.alias FROM (",
      "\n  UNION ALL\n".join(f"  SELECT {q(k)} AS alias, {q(v)} AS masterCode" for k, v in ALIASES_FOR_MAPPED.items()) + "\n) a",
      "JOIN cabinet_dealz.cabinets c ON c.masterCode = a.masterCode",
      "WHERE NOT EXISTS (SELECT 1 FROM cabinet_dealz.cabinet_aliases x WHERE x.alias = a.alias);", ""]
sku_counts = {}
glass_rows = []
for sc, nm, col in STY:
    b += 1
    rows = []
    for s, m in sku_master.items():
        if not PRICE[s][col].strip(): continue
        price, dsku, cmt = sku_price(s, col)
        rows.append(f"  SELECT {q(s)} AS dlSku, {q(dsku)} AS distSku, {q(m)} AS masterCode, {price} AS listPrice /* {cmt} */")
        if s in GLASS_PLAIN:
            base = GLASS_PLAIN[s]
            glass_rows.append([s, m, base, sc, col, PRICE[base][col], PRICE[s][col], price, f"{PL} rows {base} and {s}"])
    sku_counts[sc] = len(rows)
    L += [f"-- Block {b}: distributor_skus for door style {sc} using the {col.upper()} price column ({len(rows)} SKUs; pending, unpublished). Glass rows = cabinet + door price.",
      "INSERT INTO cabinet_dealz.distributor_skus (cabinetId, distributorId, styleId, platformSku, distributorSku, constructionType, listPrice, isPublished, status, supplierCabinetName)",
      f"SELECT c.id, ds.distributorId, ds.id, CONCAT(m.dlSku, '-{nm}-DL'), m.distSku, 'framed', m.listPrice, FALSE, 'pending', m.distSku",
      "FROM (\n" + "\n  UNION ALL\n".join(rows) + "\n) m",
      "JOIN cabinet_dealz.cabinets c ON c.masterCode = m.masterCode",
      f"JOIN cabinet_dealz.door_styles ds ON ds.styleCode = '{sc}' AND ds.distributorId = (SELECT id FROM cabinet_dealz.distributors WHERE code = 'DL')",
      f"WHERE NOT EXISTS (SELECT 1 FROM cabinet_dealz.distributor_skus x WHERE x.platformSku = CONCAT(m.dlSku, '-{nm}-DL'))",
      "  AND (m.dlSku = '2DB33' /* intentional 2nd DL SKU on B33 (Tom) */ OR NOT EXISTS (SELECT 1 FROM cabinet_dealz.distributor_skus y WHERE y.distributorId = ds.distributorId AND y.styleId = ds.id AND y.cabinetId = c.id));", ""]
newlist = ', '.join(q(c) for c in NEW)
b += 1
L += [f"-- Block {b}: read-only check. Expect new_masters = {len(NEW)} (0 if re-run), new_masters_hidden = {len(NEW)}, new_published = 0.",
 "SELECT",
 f"  (SELECT COUNT(*) FROM cabinet_dealz.cabinets WHERE masterCode IN ({newlist})) AS new_masters,",
 f"  (SELECT COUNT(*) FROM cabinet_dealz.cabinets WHERE masterCode IN ({newlist}) AND isActive = 0 AND showInDesigner = 0 AND showInCatalog = 0 AND showIn2020 = 0) AS new_masters_hidden,",
 "  (SELECT COUNT(*) FROM cabinet_dealz.distributor_skus WHERE platformSku LIKE '%-DL' AND isPublished = 0 AND status = 'pending') AS dl_pending_skus,",
 "  (SELECT COUNT(*) FROM cabinet_dealz.distributor_skus WHERE platformSku LIKE '%-DL' AND isPublished = 1) AS dl_published_skus;", "",
 "-- Read-only: confirm how existing masters are flagged. RH36 is created isNotCabinet = FALSE like the RHF hood fronts (cabinets). FLAT PANEL 28X96 is created isNotCabinet = TRUE like the filler/panel accessories: if FPL3796 / SPW / IS3696 show isNotCabinet = 0 here, change it before running.",
 "SELECT masterCode, category, subCategory, isNotCabinet, isActive, showInDesigner FROM cabinet_dealz.cabinets WHERE masterCode IN ('RHF30', 'RHF36', 'RH36', 'FPL3796', 'SPW', 'IS3696', 'FPV4296', 'WSV30', 'SPB9', 'BWB18', 'B33');", ""]
open("dl_unmatched_masters_tidb.sql", "w").write("\n".join(L))
with open("dl_unmatched_glass_pricing.csv", "w", newline="") as f:
    w = csv.writer(f, lineterminator="\n")
    w.writerow(["dlDoorSku", "masterCode", "plainCabinetSku", "doorStyle", "priceTier", "plainCabinetPrice", "glassDoorPrice", "skuListPrice", "sourceRows"])
    w.writerows(glass_rows)

# ---- per-value specs for the new masters ----------------------------------------------------------------------
with open("dl_unmatched_specs.csv", "w", newline="") as f:
    w = csv.writer(f, lineterminator="\n")
    w.writerow(["masterCode", "field", "value", "source", "note"])
    for code, (cat, sub, place, corner, why) in NEW.items():
        x = NEW_X.get(code); s = SPEC.get(code); p = PRICE.get(code)
        if x:
            src = x["src"]
            vals = [("width_in", x["W"]), ("height_in", x["H"]), ("depth_in", x["D"]), ("doors", x["doors"]), ("drawers", x["drawers"]), ("shelves", "")]
        else:
            src = f'{SB} p.{s["specBookPage"]}' if s else f"{PL} row {code}"
            vals = [("width_in", s["widthIn"] if s else p["width"]), ("height_in", s["heightIn"] if s else p["height"]), ("depth_in", s["depthIn"] if s else p["depth"]),
                    ("doors", s["doors"] if s else ""), ("drawers", s["drawers"] if s else ""), ("shelves", s["shelves"] if s else "")]
        if code.startswith("W12") and code.endswith("GD"):
            vals[5] = ("shelves", SPEC[code[:5]]["shelves"])
        for k, v in vals:
            w.writerow([code, k, v if v not in ("", None) else "NULL", src if v not in ("", None) else "not found", "" if v not in ("", None) else "not in any source: left NULL"])
        for k in ("door_sizes", "drawer_sizes", "construction", "materials", "hardware", "finish", "package_length", "package_width", "package_height", "package_weight_lb"):
            w.writerow([code, k, "NULL", "not found", "not in the spec book or price list" + ("; weight/cube rule: DL-written first, then master, then similar SKU/research (not implemented, held for Tom)" if k.startswith("package") else "")])
        w.writerow([code, "photo", "NULL", "none", "photo source order: master/reference image first (none exists for a new master), then DL's spec book image; not extracted or uploaded"])
        w.writerow([code, "category/subCategory/placement", f"{cat} / {sub} / {place}", "classification (mine)", why])
        if x and x["specNotes"]: w.writerow([code, "specNotes", x["specNotes"], "Tom Oct 31, 2026", ""])
from collections import Counter
cnt = Counter(r[1] for r in report)
print(dict(cnt), "blocks", b, "sku rows per style", sku_counts)
