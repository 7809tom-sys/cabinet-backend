"""Resolve the unmatched DL SKUs (crosswalk rows with matchType 'none' plus the one 'low' row).

Inputs (all in this folder): dl_crosswalk.orig.csv (the merged crosswalk), dl_prices.csv (Price List P5 v1_13_26),
dl_spec_book_items.csv (parsed from DL Specification Book v.11/14/23).
Outputs: dl_crosswalk.csv, dl_unmatched_masters_tidb.sql, dl_unmatched_specs.csv, dl_unmatched_report.csv.
Master catalog reference: data/distributor-connections/cabinet-descriptions-corrected-2026-10-26.xlsx (the live DB
was NOT queried), so every 'matched' master must be confirmed against the live catalog before the SQL is run.
Run: python3 build_unmatched.py
"""
import csv, re

PRICE = {r["dlSku"]: r for r in csv.DictReader(open("dl_prices.csv"))}
SPEC = {r["dlSku"]: r for r in csv.DictReader(open("dl_spec_book_items.csv"))}
ORIG = list(csv.DictReader(open("dl_crosswalk.orig.csv")))
SB = "DL Specification Book v.11/14/23"
PL = "DL Price List P5 (v1_13_26)"
SHEET = "master description sheet 2026-10-26 (repo xlsx)"

# ---- decisions -----------------------------------------------------------------------------------------------
# MAP: dlSku -> (masterCode, matchType, confidence, reason)
MAP = {}
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
    "Tom 11:17: keep review flag. Verified: DL spec book p.8 WMC3018 = 30x18x12 wall microwave cabinet, 0 doors, 1 shelf (open) -> type/size confirmed; master is a 30x18x11-7/8 wall microwave open box (SK), meaning of PWB not documented anywhere; closer-depth candidates WMS3018 / WOC3018 (USCD, 12D). FLAGGED in Cabinet Conflict (review)."
    f" {SB}: wall microwave cabinet 30 x 18 x 12, 0 doors, 1 shelf (open). Master is '30 x 18 x 11 7/8 Wall Microwave Open Box' (SK). Same type and construction; depth differs by 1/8 in")
MAP["DWP3"] = ("DWR3", "nomenclature-equivalent", "high",
    f"{SB}: dishwasher panel 3 x 34-1/2 x 24 (Tom confirmed). DWR3 (alias BEP3) is the 3W x 34-1/2H x 24D dishwasher return panel. Identical size and item")
MAP["GH30"] = ("SGH30", "nomenclature-equivalent", "high",
    f"{SB}: glass holder 30 x 1-1/2 x 12 (Tom confirmed). SGH30 is Stem Glass Holder 30W x 1-1/2H x 12D. Identical size and item")
MAP["TOUCHUP KIT"] = ("TUK", "nomenclature-equivalent", "high", f" Tom confirmed Oct 31 11:17: touch-up kit, every supplier carries it. {SB}: touch-up kit (paint pen and putty). Master TUK is 'Touch Up Kit'. Same item; no dimensions in the master to compare")
MAP["PAINT"] = ("SPRAYPAINT", "nomenclature-equivalent", "high", f" Tom confirmed Oct 31 11:17: spray paint, carried throughout. {SB}: spray paint 2-1/2 x 8 x 2-1/2. Master SPRAYPAINT is 'Spray Paint Touch-Up'. Same item; the master has no dimensions or color, so DL's color match is not confirmed")
MAP["SCRIBEMOLDING"] = ("SM8", "nomenclature-equivalent", "high", f" Tom confirmed Oct 31 11:17: standard scribe molding, everybody has it. {SB}: scribe molding 96 x 3/4 x 1/4. Master SM8 is 'Scribe Moulding - 96\"'. Same item and length; the master has no profile dimensions")
MAP["RRP27(1.5)"] = ("REPV2796", "dimension-equivalent", "high", f"Verified in the DL spec book p.13 (Refrigerator Panel): RRP27 (1.5) is 1-1/2in thick x 96 high x 27 deep, so (1.5) = the 1-1/2in panel thickness and the size matches REPV2796 27D x 96H. The master records no thickness, so thickness is not compared. Tom: keep mapping, raised to high. {SB}: refrigerator panel 1-1/2 x 96 x 27. Master REPV2796 is 'Refrigerator End Panel - 27\"D x 96\"H' (SK). Same item, height and depth; the master has no thickness")
MAP["FILLER 6X96"] = ("F696", "dimension-equivalent", "high", f"{SB}: filler 6 x 96 x 3/4. Master F696 is '6\" x 96\" Tall Filler' (CS/SK/USCD). Same item and size")

MAP["SP09"] = ("SPB9", "alias", "high", "Tom confirmed SP09 = SPB9, the same item: a 9in Spice Base / Pull-Out (spice pull-out; every supplier carries it). Master description unchanged. Alias SP09 -> SPB9, no new master; duplicate resolved this way. Spec book SP09 = 9 x 34-1/2 x 24, 1 drawer, 3 shelves")
MAP["BWBKT18"] = ("BWB18", "alias", "high", "Tom confirmed BWBKT18 = BWB18, the same cabinet (18in Base Waste Basket, SK). Alias BWBKT18 -> BWB18. Spec book: 18 x 34-1/2 x 24, 0 doors, 2 drawers, trash cans sold separately")
MAP["RH36"] = ("RHF36", "alias", "high",
    f"Tom FINAL Oct 31: RH36 is the SAME item as RHF36, a range hood cabinet (isNotCabinet=FALSE); alias RH36 -> RHF36, no separate master; DL SKUs under RHF36 at DL's own prices. DL's own specs ({SB} p.{SPEC['RH36']['specBookPage']}: 36W x 36H x 24D, 0 doors, 0 shelves) stay on the DL SKU geometry; Faircrest/Ashford RHF36 specs stay on theirs. FLAGGED in Cabinet Conflict (review) on RHF36: the two suppliers' numbers disagree (see the Range Hoods section of the findings)")
ALIASES_FOR_MAPPED = {"SP09": "SPB9", "BWBKT18": "BWB18", "RH36": "RHF36"}

# NEW masters (keys are MASTER codes; NEW_DL maps master -> DL SKU that creates it; NEW_X holds explicit values)
NEW_DL = {}
NEW_X = {}
for h, shelves in (("30", 2), ("36", 2), ("42", 3)):
    gm = f"W12{h}GD"
    GLASS_MASTER[f"WG12{h}"] = gm
    NEW_DL[gm] = f"WG12{h}"
    NEW_X[gm] = dict(
        desc=f'Wall cabinet Single Glass door - 12"W x {h}"H x 12"D, 1 door, {shelves} shelves',
        W=12, H=int(h), D=12, doors=1, drawers=None, isNot=False, specNotes=None, descSrc="DL spec book v.11/14/23 (W12%s p.%s; WG12%s p.%s)" % (h, SPEC[f"W12{h}"]["specBookPage"], h, SPEC[f"WG12{h}"]["specBookPage"]),
        src=f"{SB} W12{h} p.{SPEC[f'W12{h}']['specBookPage']} (1 door, {shelves} shelves); glass door WG12{h} p.{SPEC[f'WG12{h}']['specBookPage']} (glass door 11-11/16 x {SPEC[f'WG12{h}']['heightIn']} x 3/4); {PL}",
        alias=f"WG12{h}")
# (cabinets). dlSku -> (category, subCategory, placement, cornerType or None, why-no-master)
NEW = {
 "2DB33": ("Base", "Drawer Base", "base", None, "Tom FINAL Oct 31: 2DB33 is a UNIQUE item with its own master; it is never linked, aliased, substituted or cross-referenced to any regular base cabinet. DL spec book: 33in two-drawer base, 0 doors, 2 drawers. Priced at DL's own 2DB33 price-list prices"),
 "W1230GD": ("Wall", "Wall Cabinet With Glass Door", "wall", None, "Tom approved Oct 31: no 12-wide W12{30,36,42}GD master exists (12-wide glass cabinets exist only at 12 high). SKU keeps DL's own listed WG1230 price as-is. If a master already exists under this code the NOT EXISTS guard skips the insert and the SKUs attach to it"),
 "W1236GD": ("Wall", "Wall Cabinet With Glass Door", "wall", None, "Tom approved Oct 31 (see W1230GD). SKU keeps DL's own listed WG1236 price as-is"),
 "W1242GD": ("Wall", "Wall Cabinet With Glass Door", "wall", None, "Tom approved Oct 31 (see W1230GD). SKU keeps DL's own listed WG1242 price as-is"),
 "FLAT PANEL 28X96": ("Panels", "Flat Panel", "accessory", None, "Tom Oct 31: 28 x 96 flat panel CUT DOWN ON THE JOB SITE. No existing panel master matches (nearest 3/4 in panels FPL2496 / FPL3796 are 96 x 24-3/8 / 37-3/8; the spec book lists FLAT PANEL 27X96, 3/4 thick, p.13). Modeled like the existing panels / filler accessories"),
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
}

# ACCESSORY / report items: dlSku -> (class, proposed handling)
ACC = {}
def acc(skus, cls, handling):
    for s in skus: ACC[s] = (cls, handling)
for w in (15, 18):
    for h in (30, 36, 42):
        MAP[f"WG{w}{h}"] = (f"W{w}{h}GD", "nomenclature-equivalent", "high",
            f"Tom confirmed Oct 31, 2026: WG{w}{h} is the glass DOOR only, not a cabinet; maps to the existing W{w}{h}GD. {SB} p.{SPEC[f'WG{w}{h}']['specBookPage']}: loose glass door {SPEC[f'WG{w}{h}']['widthIn']} wide x {SPEC[f'WG{w}{h}']['heightIn']} high x 3/4. The SKU keeps DL's own listed price for WG{w}{h} as-is (no price changes)")
for s, m in (("WDCG243012", "DCW2430GD"), ("WDCG243612", "DCW2436GD"), ("WDCG244212", "DCW2442GD")):
    MAP[s] = (m, "nomenclature-equivalent", "high",
        f"Tom confirmed Oct 31, 2026: {s} -> {m}. {s} is the diagonal-corner glass door ({SB} p.{SPEC[s]['specBookPage']}); {m} is the existing diagonal corner glass door cabinet (24W x {s[6:8]}H x 12D). The SKU keeps DL's own listed price for {s} as-is (no price changes)")
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

acc(["SP2436"], "panel / likely decorative door (no spec-book entry)", "Spec-book lookup (pdftotext of v.11/14/23, searched 'SP2436', 'SP 2436', '2436'): NOT FOUND; only W2436 and WDC243612 contain the digits, so there is no description, thickness, finish or page. Price list row only: core $33 / slim $33 / luxe $66, no dimensions ('non-door item'). Tom: a panel / probably a decorative door, not a cabinet")
for _k, (_c, _h) in list(ACC.items()):
    _h = re.sub(r"\.? ?Propose (a )?new accessory masters?[^.]*\.?", ". Decision: hidden new master + pending SKU, flagged in Cabinet Conflict.", _h)
    _h = _h.replace("Ask Rich before creating anything", "Flagged in Cabinet Conflict").replace("Ask Rich", "Confirm with DL").replace("ask Rich", "confirm with DL")
    _h = re.sub(r"\.? ?Propose accessory masters once Rich confirms[^.]*(\([^)]*\))?\.?", ". Decision: hidden new master + pending SKU, flagged in Cabinet Conflict (confirm what the item is, and whether sold per pair).", _h)
    _h = re.sub(r"\.? ?List only until Rich confirms size\.?", ". Decision: hidden new master + pending SKU, flagged in Cabinet Conflict (confirm size).", _h)
    _h = re.sub(r"\.? ?Ask Tom/Rich\.?", ". Flagged in Cabinet Conflict.", _h)
    ACC[_k] = (_c, _h)
SKIP = {
 "QUARTER DOOR": "spec-book lookup (pdftotext of v.11/14/23, searched QUARTER DOOR / quarter / 1/4 door): NOT FOUND. Decision per rule A/C: hidden new master + pending SKU, flagged in Cabinet Conflict. Not waiting on Rich",
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

# ---- Tom's standing rule (Oct 31): anything unsure goes to the CABINET CONFLICT tab -------------------------------
# Existing mechanism, no new flag: cabinets.conflictStatus ('conflict' hides, 'review' stays public) + conflictReason
# (Issue / Current value / Source / Needed / Resolved fields, as shared/cabinetConflictFlags.formatConflictReason)
# + conflictedAt, exactly what catalog.setConflict writes. Unsure items still get a SKU (pending, unpublished).
# Report-only items (accessory-report) and QUARTER DOOR each get their OWN hidden master (DL code = master code and
# alias) so the SKU has a master to hang on; that master is flagged 'conflict'.
PH = {}   # placeholder masters: dlSku -> dict
CLASS_CAT = [("molding", ("Moulding", "Moulding")), ("panel", ("Panels", "Panel")), ("filler", ("Filler", "Filler")),
             ("pullout", ("Accessory", "Rollout Tray")), ("drawer slides", ("Accessory", "Drawer Slides")),
             ("trash", ("Accessory", "Trash Can")), ("sample", ("Accessory", "Sample")), ("decorative door", ("Panels", "Decorative Door")),
             ("floating", ("Accessory", "Floating Shelf")), ("corbel", ("Accessory", "Decorative")), ("decorative", ("Accessory", "Decorative")), ("leg", ("Accessory", "Decorative"))]
def cat_for(cls):
    for k, v in CLASS_CAT:
        if k in cls.lower(): return v
    return ("Accessory", "General")
def num(v):
    return None if v in ("", None) else float(v)

def reason(issue, current, source, needed, fields=None):
    lines = [f"Issue: {issue}", f"Current value: {current}", f"Source: {source}", f"Needed: {needed}"]
    if fields: lines.append(f"Resolved fields: {', '.join(fields)}")
    return "\n".join(lines)
FIELDS = ["description", "category", "subCategory", "width", "height", "depth"]

for s, (cls, handling) in ACC.items():
    sp = SPEC.get(s); pr = PRICE[s]
    cat, sub = cat_for(cls)
    W, H, D = (num(sp["widthIn"]), num(sp["heightIn"]), num(sp["depthIn"])) if sp else (num(pr["width"]), num(pr["height"]), num(pr["depth"]))
    d = f'{s} ({cls})' + "".join(f" - {n}" for n in [" x ".join(f'{x:g}"{l}' for x, l in zip((W, H, D), ("W", "H", "D")) if x is not None)] if n)
    issue = handling
    needed = "Admin confirms what this item is, the right master / category, and the real dimensions, then clears the conflict."
    if s == "SP2436":
        issue = "Likely decorative door 24x36; not found in DL spec book; confirm. (Tom is fairly but not fully sure; 24x36 is read from the code.) " + handling
        W, H, D = 24.0, 36.0, None
        cat, sub = "Panels", "Decorative Door"
        d = 'SP2436 (likely decorative door) - 24"W x 36"H (size inferred from the code)'
        needed = "Confirm it is a decorative door, its real size and thickness (confirm with DL), then alias to the matching decorative door master if one exists."
    src = (f"{SB} p.{sp['specBookPage']}" if sp else f"{SB}: NOT FOUND (no entry for {s})") + f"; {PL} row {s} (core {pr['core'] or '-'}, slim {pr['slim'] or '-'}, luxe {pr['luxe'] or '-'})"
    PH[s] = dict(cat=cat, sub=sub, W=W, H=H, D=D, desc=d, cls=cls, why=handling, reason=reason(issue, d, src, needed, FIELDS), src=src)
PH["QUARTER DOOR"] = dict(cat="Accessory", sub="Unknown", W=None, H=None, D=None, desc="QUARTER DOOR (unidentified)", cls="unidentified",
    why="Spec-book lookup found nothing; decided per rules A and C: hidden master + pending SKU + conflict", src=f"{SB}: NOT FOUND (no entry for QUARTER DOOR); {PL} row QUARTER DOOR ({PRICE['QUARTER DOOR']['core'] or '-'})",
    reason=reason("Unidentified DL item; not found in DL spec book (searched QUARTER DOOR / quarter / 1/4 door).", "QUARTER DOOR (unidentified)", f"{SB}: NOT FOUND; {PL} row QUARTER DOOR", "Admin identifies the item (confirm with DL), then maps or classifies it.", FIELDS))
assert set(PH) == set(ACC) | {"QUARTER DOOR"}
assert set(PH) >= set(SKIP) and set(SKIP) == {"QUARTER DOOR"}

# New masters whose values are not fully sure -> conflict on the hidden master itself
CONF_NEW = {
 "FDB09": ("Size from the price list only; FDB09 is not in the DL spec book; door count and shelves unknown.", "Confirm width/depth/door count with DL."),
 "CL156012": ("Category 'Tall / Counter Linen Cabinet' is my classification of a 15 x 60 x 12 unit.", "Confirm category and subCategory."),
 "DSK2421": ("subCategory 'Knee Drawer' is my classification; no existing master has this size.", "Confirm subCategory."),
 "DSK3021": ("subCategory 'Knee Drawer' is my classification; DKD30 is 30 x 5-1/4 x 21 (different height).", "Confirm subCategory and whether it duplicates DKD30."),
 "WEOS0930": ("subCategory 'Open Shelf' is my classification; open end shelf masters are 6in wide, DL is 9in.", "Confirm subCategory."),
 "WEOS0936": ("subCategory 'Open Shelf' is my classification; open end shelf masters are 6in wide, DL is 9in.", "Confirm subCategory."),
 "WEOS0942": ("subCategory 'Open Shelf' is my classification; open end shelf masters are 6in wide, DL is 9in.", "Confirm subCategory."),
 "FLAT PANEL 28X96": ("3/4in thickness is TAKEN FROM THE 27X96 ROW (spec book p.13), not from a 28X96 entry (none exists); finish is NULL (not stated in any source); 28in width is from the price list. Field cut on site.", "Confirm the 3/4in thickness and the finish with DL, and 28 vs 27 width."),
}

targets = [r for r in ORIG if r["matchType"] == "none" or r["confidence"] == "low"]
assert len(targets) == 90, len(targets)
DLSET_NEW = set(NEW_MASTER_OF)
known = set(MAP) | DLSET_NEW | set(PH)
missing = [r["dlSku"] for r in targets if r["dlSku"] not in known]
extra = [s for s in known if s not in {r["dlSku"] for r in targets}]
assert not missing and not extra, (missing, extra)
assert len(MAP) + len(DLSET_NEW) + len(PH) == 90

def src_of(s, status):
    parts = []
    if s in SPEC: parts.append(f"{SB} p.{SPEC[s]['specBookPage']}")
    else: parts.append(f"{SB}: no entry for {s}")
    parts.append(f"{PL} row {s}")
    if status in ("mapped", "aliased"): parts.append(SHEET)
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
        flagged = cf == "medium"
        row.update(masterCode=m, matchType=mt, confidence=cf, note=why + (" | FLAGGED in Cabinet Conflict (review) on the master" if flagged else ""))
        status = "aliased" if mt == "alias" else "mapped"
    elif s in DLSET_NEW:
        m = NEW_MASTER_OF[s]
        why = NEW[m][4] if m in NEW else ""
        flagged = True
        row.update(masterCode=m, matchType="new-master", confidence="", note=f"NEW hidden master {m}: {why}. Source: " + (NEW_X[m]["src"] if m in NEW_X else (f"{SB} p.{SPEC[s]['specBookPage']}" if s in SPEC else f"{PL} only")) + (" | FLAGGED in Cabinet Conflict (review, automatic: unique to DL)" + ((": " + CONF_NEW[m][0]) if m in CONF_NEW else "") if flagged else ""))
        status = "new master"
    else:
        ph = PH[s]
        row.update(masterCode=s, matchType="conflict-flagged", confidence="", note=f"Own hidden master {s} + pending SKU, FLAGGED in Cabinet Conflict (review, automatic; published with its SKU). {ph['why']}")
        status = "flagged"
    out.append(row)
    report.append((s, status, row["masterCode"], row["matchType"], row["confidence"], row["note"], src_of(s, status)))
with open("dl_crosswalk.csv", "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(ORIG[0].keys()), lineterminator="\n")
    w.writeheader(); w.writerows(out)
with open("dl_unmatched_report.csv", "w", newline="") as f:
    w = csv.writer(f, lineterminator="\n"); w.writerow(["dlSku", "status", "masterCode", "matchType", "confidence", "reason", "source"]); w.writerows(report)

# ---- SQL ------------------------------------------------------------------------------------------------------
q = lambda s: "'" + str(s).replace("'", "''") + "'"
def g(v):
    return "NULL" if v is None else f"{float(v):g}"
def desc(code):
    s = SPEC.get(code)
    if s:
        kind = NEW[code][1] if code in NEW else s["specSection"].rstrip("s")
        parts = [f'{kind} - {s["widthIn"].rstrip("0").rstrip(".")}"W x {s["heightIn"].rstrip("0").rstrip(".")}"H x {s["depthIn"].rstrip("0").rstrip(".")}"D']
        if s["doors"] != "": parts.append(f'{s["doors"]} door(s)')
        if s["drawers"] != "": parts.append(f'{s["drawers"]} drawer(s)')
        if s["shelves"] != "": parts.append(f'{s["shelves"]} shelf(ves)')
        return ", ".join(parts)
    return f'9" Full Height Door Base Cabinet (size from {PL}; door count and shelves not found in any source)'

STY = [("DL-WS", "WS", "core"), ("DL-SSA", "SSA", "slim"), ("DL-SSE", "SSE", "slim"), ("DL-LUXE-TBD", "LUXE-TBD", "luxe")]
sku_master = {s: v[0] for s, v in MAP.items()}
sku_master.update(NEW_MASTER_OF)
sku_master.update({s: s for s in PH})
# Items that are accessories (not cabinets): constructionType NULL
ACC_MAPPED = {"DWP3", "GH30", "TOUCHUP KIT", "PAINT", "SCRIBEMOLDING", "RRP27(1.5)", "FILLER 6X96"}
NO_CT = ACC_MAPPED | set(PH) | {"FLAT PANEL 28X96"}
def sku_price(s, col):
    """(listPrice, distributorSku, comment). No price changes: every SKU keeps its own DL price-list price as-is."""
    return int(PRICE[s][col]), s, f"{s} {PRICE[s][col]}"

# DL's own description / dimensions / spec source go on the DL SKU (geometry columns + supplierCabinetName), never on the master.
def dl_geom(s):
    sp = SPEC.get(s); pr = PRICE[s]
    if sp:
        return num(sp["widthIn"]), num(sp["heightIn"]), num(sp["depthIn"]), f"{SB} p.{sp['specBookPage']}", f"{s} - {sp['specSection']} (DL spec book)"
    W, H, D = num(pr["width"]), num(pr["height"]), num(pr["depth"])
    return W, H, D, (f"{PL} row {s}" if any(v is not None for v in (W, H, D)) else None), f"{s} - {pr['description']} (DL price list)"

L = ["-- DL Cabinetry: NEW masters and pending SKUs for the previously unmatched DL items. PREPARED, NOT RUN. Do not run without Tom's review.",
 f"-- Sources: {SB} (page per item in dl_spec_book_items.csv), {PL}, master description sheet 2026-10-26 (live DB was not queried). Decisions: Tom, Oct 31, 2026.",
 "-- Generated by build_unmatched.py. One statement per numbered block. Every statement is guarded (NOT EXISTS on masterCode / alias / platformSku) so re-running is safe.",
 "-- INSERT blocks: new master cabinets are inserted unpublished (isActive = FALSE, showInDesigner = FALSE, showInCatalog = FALSE, showIn2020 = FALSE) and every DL SKU is isPublished = FALSE, status = 'pending'.",
 "-- Publishing happens ONLY in the clearly labeled PUBLISH SECTION at the end (Tom runs it by hand). Rules F and G: a new master is never left unpublished, and unsure items are published AND flagged.",
 "-- NO PRICE CHANGES: every SKU keeps DL's own price-list price as-is (WG / WDCG glass-door SKUs included). New masters keep DL's nominal W/H/D (rule I); DL's own description, dims and spec page also sit on the DL SKU (supplierCabinetName, geometry*).",
 "-- CABINET CONFLICT (rule C, AUTOMATIC): the generator writes a conflictStatus / conflictReason / conflictedAt entry for every UNIQUE or UNSURE item, with no manual step:",
 "--   every new master (unique to DL) and every previously report-only item is inserted with conflictStatus = 'review'; every existing master that received a MEDIUM-confidence DL mapping gets conflictStatus = 'review' (UPDATE ... WHERE conflictStatus = 'none', so an existing flag is never overwritten).",
 "--   'review' is the existing public status: the row stays usable everywhere and is listed in Admin > Cabinet Conflict. Nothing in this file removes a master or alias row (rule H).",
 "-- BEFORE running: confirm in the live database that none of the NEW master codes already exists under another code, and that each MAPPED master exists.", ""]
CONF_FIELDS_NOTE = FIELDS
CONFLICT_STATUS = "review"   # published AND flagged (Tom rule F): the public review status of the existing mechanism, never hidden "conflict"
b = 0
ALLNEW = []   # (code, record) for master inserts, new masters first then placeholders
for code, (cat, sub, place, corner, why) in NEW.items():
    x = NEW_X.get(code); s = SPEC.get(code)
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
    # Rule C (automatic): a new master is UNIQUE to this supplier by definition -> always a Cabinet Conflict entry.
    if code in CONF_NEW:
        issue, needed = CONF_NEW[code]
    else:
        issue = f"Unique to DL: no existing master matched ({why})."
        needed = "Admin confirms the item, its category and master code (and whether another supplier carries it), then clears the flag."
    conflict = reason(issue, d, src, needed, FIELDS)
    ALLNEW.append(dict(code=code, cat=cat, sub=sub, place=place, corner=corner, why=why, W=W, H=H, D=D, doors=doors, drawers=dr, desc=d, dsrc=dsrc, src=src, notes=notes, isnot=isnot, conflict=conflict, kind="NEW hidden master"))
for s, ph in PH.items():
    ALLNEW.append(dict(code=s, cat=ph["cat"], sub=ph["sub"], place="accessory", corner=None, why=ph["why"], W=ph["W"], H=ph["H"], D=ph["D"], doors=None, drawers=None,
                       desc=ph["desc"], dsrc="DL Cabinetry spec book v.11/14/23" if s in SPEC else "DL Price List P5 v1_13_26", src=ph["src"], notes=None, isnot=True, conflict=ph["reason"], kind="FLAGGED hidden master (report-only item)"))
n_ = lambda v: "NULL" if v is None else str(v)
for r in ALLNEW:
    b += 1
    code = r["code"]
    confcols = ", conflictStatus, conflictReason, conflictedAt"
    confvals = f", {q(CONFLICT_STATUS)}, {q(r['conflict'])}, NOW()"
    L += [f"-- Block {b}: {r['kind']} {code} ({r['why']}). Source: {r['src']}. Any value not in the source is NULL." + " CABINET CONFLICT entry added automatically (review, stays public once published).",
          "INSERT INTO cabinet_dealz.cabinets (masterCode, description, descriptionSource, category, subCategory, width, height, depth, placementType, numberOfDoors, numberOfDrawers, isCornerCabinet, cornerType, isActive, showInDesigner, showInCatalog, showIn2020, isNotCabinet, specNotes" + confcols + ")",
          f"SELECT {q(code)}, {q(r['desc'])}, {q(r['dsrc'])}, {q(r['cat'])}, {q(r['sub'])}, {g(r['W'])}, {g(r['H'])}, {g(r['D'])}, {q(r['place'])}, {n_(r['doors'])}, {n_(r['drawers'])}, {'TRUE' if r['corner'] else 'FALSE'}, {q(r['corner']) if r['corner'] else 'NULL'}, FALSE, FALSE, FALSE, FALSE, {'TRUE' if r['isnot'] else 'FALSE'}, {q(r['notes']) if r['notes'] else 'NULL'}{confvals}",
          f"FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM cabinet_dealz.cabinets WHERE masterCode = {q(code)})",
          f"  AND NOT EXISTS (SELECT 1 FROM cabinet_dealz.cabinet_aliases WHERE alias = {q(code)});", ""]
pairs = []
for r in ALLNEW:
    pairs.append((r["code"], r["code"]))
    dl = NEW_DL.get(r["code"])
    if dl and dl != r["code"]: pairs.append((dl, r["code"]))
b += 1
L += [f"-- Block {b}: aliases for every new / flagged master (the DL code is the alias; for W12##GD the alias WG12## points at the new glass cabinet)",
      "INSERT INTO cabinet_dealz.cabinet_aliases (cabinetId, alias)",
      "SELECT c.id, a.alias FROM (",
      "\n  UNION ALL\n".join(f"  SELECT {q(a)} AS alias, {q(m)} AS masterCode" for a, m in pairs) + "\n) a",
      "JOIN cabinet_dealz.cabinets c ON c.masterCode = a.masterCode",
      "WHERE NOT EXISTS (SELECT 1 FROM cabinet_dealz.cabinet_aliases x WHERE x.alias = a.alias);", ""]
b += 1
L += [f"-- Block {b}: Tom-confirmed aliases on EXISTING masters (SP09 -> SPB9 spice pull-out, BWBKT18 -> BWB18). Skipped if the alias already exists or the master is missing.",
      "INSERT INTO cabinet_dealz.cabinet_aliases (cabinetId, alias)",
      "SELECT c.id, a.alias FROM (",
      "\n  UNION ALL\n".join(f"  SELECT {q(k)} AS alias, {q(v)} AS masterCode" for k, v in ALIASES_FOR_MAPPED.items()) + "\n) a",
      "JOIN cabinet_dealz.cabinets c ON c.masterCode = a.masterCode",
      "WHERE NOT EXISTS (SELECT 1 FROM cabinet_dealz.cabinet_aliases x WHERE x.alias = a.alias);", ""]
# existing shared masters that still need a human look -> 'review' (stays public), never overwrite an existing flag
HOOD_SRC = (f"DL: {SB} p.{SPEC['RH36']['specBookPage']} 'Range Hood Cover' RH36 = 36W x 36H x 24D, 0 doors, 0 shelves; {PL} row RH36 core $543 / slim $543 / luxe $1085. "
            "Faircrest/Ashford RHF36 (CS): 36W x 23.5H x 12D in docs/proofs/rhf-catalog-form-proof.md (RHF30 30 x 23.5 x 9) and notes/dn_resolved.json ('36 x 23.5 Range Hood Fronts'); Tom quotes 23.5H x 8D. The master sheet row has no dimensions.")
REVIEW = [
 ("WMC3018", "PWB-MOS-30-18",
  reason("DL SKU WMC3018 (Wall Microwave Cabinet) mapped at MEDIUM confidence. Tom is unsure what 'PWB' means; no source in the repo explains it.",
         "PWB-MOS-30-18: '30-inch x 18-inch x 11 7/8-inch Wall Microwave Open Box' (SK), Wall / Microwave Wall Cabinet",
         f"DL {SB} p.8: WMC3018 = 30W x 18H x 12D, 0 doors, 1 shelf (open) -> type and 30x18 size CONFIRMED as a wall microwave shelf cabinet; depth differs by 1/8in. Master sheet 2026-10-26 gives no meaning for 'PWB'. Closer in depth (exactly 12D) in the same sheet: WMS3018 '30 x 18 x 12 Wall Microwave Cabinet Kit with 26-1/2 x 3/4 x 17 shelf insert' (USCD) and WOC3018 'Wall Microwave Cabinet Kit 30W x 18H x 12D' (USCD).",
         "Admin picks PWB-MOS-30-18, WMS3018 or WOC3018 for DL WMC3018 and clears this flag.")),
 ("RH36", "RHF36",
  reason("DL RH36 is the SAME item as RHF36 per Tom (alias RH36 -> RHF36), but the suppliers' numbers disagree, so the uniform name 'Range Hood <W> by <H>' cannot be built yet. DL: 36 by 36 (D 24). Faircrest/Ashford: 36 by 23.5 (D 12 in the catalog doc, 8 per Tom). Neither fits Tom's example '30 by 36'.",
         "RHF36 'Range Hood Front' (Wall / Range Hood Front, CS, isNotCabinet=FALSE)", HOOD_SRC,
         "Tom decides the uniform name and which numbers are right. DL's own specs stay on the DL SKU (geometry 36 x 36 x 24, spec page 7); Faircrest's stay on theirs; the DL spec image still has to be extracted and stored (distributor_cabinet_overrides.imageUrl).")),
]
# Rule C (automatic): every crosswalk row (all 200, not only the 90) that is UNSURE (medium / low / blank confidence) puts a
# 'review' entry on its existing master. Mirrors onboardingConflictLevel() in shared/onboardingConflicts.ts.
UNIQUE_TYPES = {"new-master", "conflict-flagged", "none", "skipped", "accessory-report"}
explicit = {m: (s, rs) for s, m, rs in REVIEW}
auto = {}
for r in out:
    if r["matchType"] in UNIQUE_TYPES or r["masterCode"] in {x["code"] for x in ALLNEW}: continue
    if r["confidence"].strip().lower() in ("medium", "low", ""):
        auto.setdefault(r["masterCode"], []).append(r)
review_rows = []
for m, (s, rs) in explicit.items():
    review_rows.append((s, m, rs))
for m, rows_ in auto.items():
    if m in explicit: continue
    skus = ", ".join(r["dlSku"] for r in rows_)
    notes = " | ".join(f"{r['dlSku']}: {r['note']}" for r in rows_)
    rsn = reason(f"DL SKU {skus} mapped to this existing master at {rows_[0]['confidence'].upper() or 'UNKNOWN'} confidence ({rows_[0]['matchType']}). Please confirm the mapping.",
                 f"master {m}", f"{PL}; DL crosswalk (dl_crosswalk.csv); {SHEET}; {notes}",
                 "Confirm DL's item is the same as this master (type, size, construction), or tell us the right master.")
    review_rows.append((skus, m, rsn))
for s, m, rsn in review_rows:
    b += 1
    L += [f"-- Block {b}: CABINET CONFLICT (review, stays public) on existing master {m} for DL SKU {s}. Does not overwrite an existing flag.",
          f"UPDATE cabinet_dealz.cabinets SET conflictStatus = 'review', conflictReason = {q(rsn)}, conflictedAt = NOW()",
          f"WHERE masterCode = {q(m)} AND conflictStatus = 'none';", ""]
sku_counts = {}
for sc, nm, col in STY:
    b += 1
    rows = []
    for s, m in sku_master.items():
        if not PRICE[s][col].strip(): continue
        price, dsku, cmt = sku_price(s, col)
        gw, gh, gd, gpage, gname = dl_geom(s)
        rows.append(f"  SELECT {q(s)} AS dlSku, {q(dsku)} AS distSku, {q(m)} AS masterCode, {price} AS listPrice, {1 if s in NO_CT else 0} AS noCt, {g(gw)} AS gW, {g(gh)} AS gH, {g(gd)} AS gD, {q(gpage) if gpage else 'NULL'} AS gPage, {q(gname)} AS dlName /* {cmt} */")
    sku_counts[sc] = len(rows)
    L += [f"-- Block {b}: distributor_skus for door style {sc} using the {col.upper()} price column ({len(rows)} SKUs; pending, unpublished). DL's own price as-is. noCt = accessory (constructionType NULL). gW/gH/gD/gPage/dlName = DL's own dimensions, source and description on the SKU (held, not verified).",
      "INSERT INTO cabinet_dealz.distributor_skus (cabinetId, distributorId, styleId, platformSku, distributorSku, constructionType, geometryWidth, geometryHeight, geometryDepth, geometrySourcePage, geometryStatus, listPrice, isPublished, status, supplierCabinetName)",
      f"SELECT c.id, ds.distributorId, ds.id, CONCAT(m.dlSku, '-{nm}-DL'), m.distSku, CASE WHEN m.noCt = 1 THEN NULL ELSE 'framed' END, m.gW, m.gH, m.gD, m.gPage, CASE WHEN m.gPage IS NULL THEN NULL ELSE 'held' END, m.listPrice, FALSE, 'pending', m.dlName",
      "FROM (\n" + "\n  UNION ALL\n".join(rows) + "\n) m",
      "JOIN cabinet_dealz.cabinets c ON c.masterCode = m.masterCode",
      f"JOIN cabinet_dealz.door_styles ds ON ds.styleCode = '{sc}' AND ds.distributorId = (SELECT id FROM cabinet_dealz.distributors WHERE code = 'DL')",
      f"WHERE NOT EXISTS (SELECT 1 FROM cabinet_dealz.distributor_skus x WHERE x.platformSku = CONCAT(m.dlSku, '-{nm}-DL'))",
      "  AND NOT EXISTS (SELECT 1 FROM cabinet_dealz.distributor_skus y WHERE y.distributorId = ds.distributorId AND y.styleId = ds.id AND y.cabinetId = c.id);", ""]
codes = ', '.join(q(r["code"]) for r in ALLNEW)
nflag = len(ALLNEW)
b += 1
L += [f"-- Block {b}: read-only check BEFORE publishing. Expect (first run) new_masters = {len(ALLNEW)}, new_masters_unpublished = {len(ALLNEW)}, flagged_review = {len(ALLNEW)}, dl_published_new = 0.",
 "SELECT",
 f"  (SELECT COUNT(*) FROM cabinet_dealz.cabinets WHERE masterCode IN ({codes})) AS new_masters,",
 f"  (SELECT COUNT(*) FROM cabinet_dealz.cabinets WHERE masterCode IN ({codes}) AND isActive = 0 AND showInDesigner = 0 AND showInCatalog = 0) AS new_masters_unpublished,",
 f"  (SELECT COUNT(*) FROM cabinet_dealz.cabinets WHERE masterCode IN ({codes}) AND conflictStatus = 'review') AS flagged_review,",
 "  (SELECT COUNT(*) FROM cabinet_dealz.distributor_skus WHERE platformSku LIKE '%-DL' AND isPublished = 0 AND status = 'pending') AS dl_pending_skus,",
 "  (SELECT COUNT(*) FROM cabinet_dealz.distributor_skus WHERE platformSku LIKE '%-DL' AND isPublished <> 0) AS dl_published_skus;", "",
 "-- Read-only: confirm how existing masters are flagged. RH36 is an alias of RHF36 (a cabinet, isNotCabinet = FALSE), no separate master. FLAT PANEL 28X96 and the report-only items are isNotCabinet = TRUE like the filler/panel accessories: if FPL3796 / SPW / IS3696 show isNotCabinet = 0 here, change them before running.",
 "SELECT masterCode, category, subCategory, isNotCabinet, isActive, showInDesigner, conflictStatus FROM cabinet_dealz.cabinets WHERE masterCode IN ('RHF30', 'RHF36', 'HOOD-30', 'HOOD-36', 'RH-15-42', 'RHC-06-30', 'FPL3796', 'SPW', 'IS3696', 'FPV4296', 'WSV30', 'SPB9', 'BWB18');", ""]

# ===== PUBLISH SECTION (Tom runs by hand). Rules F and G. Scoped to distributor 450001 and THIS PR's codes only. =====
all_sku_by_style = {}
for sc, nm, col in STY:
    all_sku_by_style[sc] = [f"{s}-{nm}-DL" for s in sku_master if PRICE[s][col].strip()]
L += ["", "-- =====================================================================================================================",
      "-- PUBLISH SECTION. Tom runs this by hand, only after reviewing everything above. Nothing above this line publishes anything.",
      "-- Scoped to distributor 450001 (DL Cabinetry) and to THIS PR's platformSkus / master codes only: no other row is touched.",
      "-- Rules F and G: unsure items are published AND stay flagged in Cabinet Conflict ('review'); a new master is never created without being published along with its SKUs.",
      "-- Run blocks in order, back to back. Before running, confirm none of the master codes below existed before this PR (a pre-existing retired master with the same code would be re-activated).",
      "-- showIn2020 is set TRUE like existing published masters (the column default is TRUE).",
      "-- ====================================================================================================================="]
allskus = [x for sc, nm, col in STY for x in all_sku_by_style[sc]]
L += ["-- Block 96A (read-only, optional, run first): which of this PR's DL SKUs are ALREADY live, for example after dl_go_live_tidb.sql Block 2 published every pending DL SKU. Blocks 97-100 skip them (they only touch status = 'pending' AND isPublished = 0) and never write a price column.",
      "SELECT COUNT(*) AS this_pr_skus_already_live, COALESCE(SUM(CASE WHEN listPrice IS NOT NULL THEN 1 ELSE 0 END), 0) AS with_price FROM cabinet_dealz.distributor_skus",
      "WHERE distributorId = 450001 AND isPublished <> 0 AND platformSku IN (" + ", ".join(q(x) for x in allskus) + ");", ""]
for sc, nm, col in STY:
    b += 1
    skus = all_sku_by_style[sc]
    L += [f"-- Block {b}: PUBLISH this PR's DL SKUs, door style {sc} ({len(skus)} SKUs): status = 'approved', isPublished = TRUE",
          "UPDATE cabinet_dealz.distributor_skus SET status = 'approved', isPublished = TRUE",
          f"WHERE distributorId = 450001 AND status = 'pending' AND isPublished = 0 AND platformSku IN (" + ", ".join(q(x) for x in skus) + ");", ""]
b += 1
L += [f"-- Block {b}: PUBLISH this PR's {len(ALLNEW)} new masters: isActive, showInDesigner, showInCatalog, showIn2020 = TRUE",
      "UPDATE cabinet_dealz.cabinets SET isActive = TRUE, showInDesigner = TRUE, showInCatalog = TRUE, showIn2020 = TRUE",
      f"WHERE masterCode IN ({codes}) AND (isActive = 0 OR showInDesigner = 0 OR showInCatalog = 0 OR showIn2020 = 0);", ""]
b += 1
L += [f"-- Block {b}: read-only check AFTER publishing. Expect new_masters_published = {len(ALLNEW)}, dl_pending_skus = 0 for this PR's SKUs, flagged_review = {len(ALLNEW)} (published and flagged).",
 "SELECT",
 f"  (SELECT COUNT(*) FROM cabinet_dealz.cabinets WHERE masterCode IN ({codes}) AND isActive = 1 AND showInDesigner = 1 AND showInCatalog = 1 AND showIn2020 = 1) AS new_masters_published,",
 f"  (SELECT COUNT(*) FROM cabinet_dealz.cabinets WHERE masterCode IN ({codes}) AND conflictStatus = 'review') AS flagged_review,",
 "  (SELECT COUNT(*) FROM cabinet_dealz.distributor_skus WHERE distributorId = 450001 AND platformSku LIKE '%-DL' AND status = 'pending') AS dl_pending_skus;", ""]
open("dl_unmatched_masters_tidb.sql", "w").write("\n".join(L))
with open("dl_unmatched_conflicts.csv", "w", newline="") as f:
    w = csv.writer(f, lineterminator="\n")
    w.writerow(["masterCode", "conflictStatus", "kind", "dlSku", "reason"])
    for r in ALLNEW:
        if r["conflict"]: w.writerow([r["code"], "review", r["kind"], NEW_DL.get(r["code"], r["code"]), r["conflict"].replace("\n", " | ")])
    for s, m, rsn in review_rows:
        w.writerow([m, "review", "existing master", s, rsn.replace("\n", " | ")])

# ---- per-value specs for the new masters ----------------------------------------------------------------------
with open("dl_unmatched_specs.csv", "w", newline="") as f:
    w = csv.writer(f, lineterminator="\n")
    w.writerow(["masterCode", "field", "value", "source", "note"])
    for r in ALLNEW:
        code = r["code"]; x = NEW_X.get(code); s = SPEC.get(code); p = PRICE.get(code)
        src = r["src"]
        if x or code in PH:
            vals = [("width_in", r["W"]), ("height_in", r["H"]), ("depth_in", r["D"]), ("doors", r["doors"]), ("drawers", r["drawers"]), ("shelves", "")]
        else:
            vals = [("width_in", s["widthIn"] if s else p["width"]), ("height_in", s["heightIn"] if s else p["height"]), ("depth_in", s["depthIn"] if s else p["depth"]),
                    ("doors", s["doors"] if s else ""), ("drawers", s["drawers"] if s else ""), ("shelves", s["shelves"] if s else "")]
        if code.startswith("W12") and code.endswith("GD"):
            vals[5] = ("shelves", SPEC[code[:5]]["shelves"])
        if code in SPEC and code not in PH and not x:
            vals[5] = ("shelves", SPEC[code]["shelves"])
        for k, v in vals:
            ok = v not in ("", None)
            w.writerow([code, k, f"{v:g}" if isinstance(v, float) else (v if ok else "NULL"), src if ok else "not found", "" if ok else "not in any source: left NULL"])
        for k in ("door_sizes", "drawer_sizes", "construction", "materials", "hardware", "finish", "package_length", "package_width", "package_height", "package_weight_lb"):
            w.writerow([code, k, "NULL", "not found", "not in the spec book or price list" + ("; weight/cube rule: DL-written first, then master, then similar SKU/research (not implemented, held for Tom)" if k.startswith("package") else "")])
        w.writerow([code, "photo", "NULL", "none", "photo source order: master/reference image first (none exists for a new master), then DL's spec book image; not extracted or uploaded"])
        w.writerow([code, "category/subCategory/placement", f"{r['cat']} / {r['sub']} / {r['place']}", "classification (mine)", r["why"]])
        if r["notes"]: w.writerow([code, "specNotes", r["notes"], "Tom Oct 31, 2026", ""])
        if r["conflict"]: w.writerow([code, "cabinet_conflict", "review", "Tom standing rule Oct 31 (automatic)", r["conflict"].replace("\n", " | ")])
from collections import Counter
cnt = Counter(r[1] for r in report)
print(dict(cnt), "hidden masters", len(ALLNEW), "conflict-flagged masters", nflag, "review flags", len(review_rows), "blocks", b, "sku rows per style", sku_counts)
