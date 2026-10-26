#!/usr/bin/env python3
"""
Build the comprehensive SKU-level master workbook from july_master.xlsx.

One row per unique SKU = <DISTRIBUTOR>-<COLORCODE>-<CABINET>.
- Distributor codes: Clark & Son = CS, Skyline = SKY, US Cabinet Depot = UCD
- Color code = distributor's own internal code (kept per-distributor; SKY-OS != UCD-OS)
- Cabinet = canonical Master Code resolved via alias clusters when possible; otherwise
  the distributor's own cabinet code is used (Clark-only items still become SKUs).
- "No price = not available" -> rows with no usable price are skipped.

Outputs:
  exports/master_skus.csv               (all distributors, one row per SKU)
  exports/master_skus_CS.csv            (Clark & Son)
  exports/master_skus_SKY.csv           (Skyline)
  exports/master_skus_UCD.csv           (US Cabinet Depot)
  exports/Cabinet_Dealz_Master_SKUs.xlsx (one tab per distributor + Summary)
  exports/master_skus_summary.txt
"""
import openpyxl, csv, re, os
from collections import defaultdict

SRC = "/home/ubuntu/july_master.xlsx"
OUT_DIR = "/home/ubuntu/cabinet-dealz/exports"
os.makedirs(OUT_DIR, exist_ok=True)

wb = openpyxl.load_workbook(SRC, read_only=True, data_only=True)
DIST_CODE = {"Clark And Son": "CS", "Clark and Son": "CS", "Skyline": "SKY", "US Cabinet Depot": "UCD"}
DIST_NAME = {"CS": "Clark & Son", "SKY": "Skyline", "UCD": "US Cabinet Depot"}

def norm(s):
    return re.sub(r'[^A-Z0-9]', '', str(s).upper()) if s is not None else ""

# ---------------------------------------------------------------------------
# 1) CD_STANDARDS color map
# ---------------------------------------------------------------------------
color_map = {}
ws = wb["(CD_STANDARDS)"]
for i, r in enumerate(ws.iter_rows(values_only=True)):
    if i == 0:
        continue
    dist, code, door, our = r[0], r[1], r[2], r[3]
    if not dist or not code:
        continue
    dcode = DIST_CODE.get(str(dist).strip())
    if not dcode:
        continue
    color_map[(dcode, str(code).strip())] = {
        "door_name": (door or "").strip(),
        "our_name": (our or door or "").strip(),
        "finish": (r[8] or "").strip() if len(r) > 8 else "",
        "door_style": (r[9] or "").strip() if len(r) > 9 else "",
        "wood": (r[10] or "").strip() if len(r) > 10 else "",
    }

# Clark color blocks that aren't in CD_STANDARDS -> register as their own family
# (public name = the block name, title-cased; code = short slug)
EXTRA_CS_COLORS = {
    "DESIGNER NATURAL": ("DN", "Designer Natural"),
    "GREEK VILLA": ("GV", "Greek Villa"),
    "RUSTIC HICKORY": ("RH", "Rustic Hickory"),
    "WINCHESTER GREY (NORRIS GREY)": ("WG", "Winchester Grey"),
}

# ---------------------------------------------------------------------------
# 2) GENERIC_INFO alias clusters
# ---------------------------------------------------------------------------
cabinet_by_alias = {}
canonical = {}
ws = wb["LOGIC GENERIC_INFO"]
rows = list(ws.iter_rows(values_only=True))
H = {name: idx for idx, name in enumerate(rows[0])}
def g(r, key):
    return r[H[key]] if key in H and H[key] < len(r) else None
for r in rows[1:]:
    item = g(r, "Item Code")
    if not item:
        continue
    rec = {
        "master_code": str(item).strip(),
        "platform_sku_stem": (str(g(r, "SKU")).strip() if g(r, "SKU") else ""),
        "vendor_sku": (str(g(r, "Vendor SKU")).strip() if g(r, "Vendor SKU") else ""),
        "alt1": (str(g(r, "Alt SKU 1")).strip() if g(r, "Alt SKU 1") else ""),
        "alt2": (str(g(r, "Alt SKU 2")).strip() if g(r, "Alt SKU 2") else ""),
        "alt3": (str(g(r, "Alt SKU 3")).strip() if g(r, "Alt SKU 3") else ""),
        "description": (str(g(r, "Description")).strip() if g(r, "Description") else ""),
        "category": (str(g(r, "Category")).strip() if g(r, "Category") else ""),
        "subcategory": (str(g(r, "Sub Category")).strip() if g(r, "Sub Category") else ""),
        "width": g(r, "Width"), "height": g(r, "Height"), "depth": g(r, "Depth"),
    }
    canonical[rec["master_code"]] = rec
    for alias in [rec["master_code"], rec["platform_sku_stem"], rec["vendor_sku"],
                  rec["alt1"], rec["alt2"], rec["alt3"]]:
        if alias:
            cabinet_by_alias.setdefault(norm(alias), rec)

def drawer_base_variants(n):
    """Generate alias variants for drawer-base style codes like DB-21-3 / 21DB-3 / 3DB21."""
    out = {n}
    m = re.match(r'^DB(\d+)(\d)$', n)              # DB213
    if m: out |= {f"{m.group(2)}DB{m.group(1)}", f"{m.group(1)}DB{m.group(2)}"}
    m = re.match(r'^(\d+)DB(\d)$', n)              # 21DB3
    if m: out |= {f"DB{m.group(1)}{m.group(2)}", f"{m.group(2)}DB{m.group(1)}"}
    m = re.match(r'^(\d)DB(\d+)$', n)              # 3DB21
    if m: out |= {f"DB{m.group(2)}{m.group(1)}", f"{m.group(2)}DB{m.group(1)}"}
    return out

def resolve_cabinet(*codes):
    for code in codes:
        if not code:
            continue
        n = norm(code)
        if n in cabinet_by_alias:
            return cabinet_by_alias[n]
        for v in drawer_base_variants(n):
            if v in cabinet_by_alias:
                return cabinet_by_alias[v]
    return None

# ---------------------------------------------------------------------------
# helpers to fabricate a record for distributor-only cabinets
# ---------------------------------------------------------------------------
NON_PRODUCT = re.compile(r'(SAMPLE|SWATCH|SPRAYPAINT|SPRAY PAINT|TRIM CHAIN|MERCHHUTCH|MERCH|KIOSK|COV$|DD-?Q?$)', re.I)

def is_non_product(code, desc=""):
    s = f"{code} {desc}".upper()
    return bool(NON_PRODUCT.search(s))

def guess_category(code, desc=""):
    c = (code or "").upper().replace(" ", "")
    n = norm(c)
    text = f"{c} {desc}".upper()
    # ADA wins
    if c.startswith("ADA") or "ADA" in n:
        return "ADA"
    # Accessory / Trim: moldings, fillers, trays, legs, panels, skins, kicks, decor
    ACC_PREFIX = ("ACM", "OCM", "ICM", "DCM", "RCM", "LACM", "CM-", "CM", "MO-", "MOULD",
                  "F-", "FF", "FBM", "FOL", "FPL", "FPV", "FS", "FSB", "FLDL", "CLDL", "SQDL",
                  "CTRAY", "RS", "ROT", "ROPE", "DWR", "BEP", "BFF", "BF", "BAM", "BM", "AG",
                  "CBLPN", "DEC", "DP", "OCS", "LCM", "LRM", "ALRM", "SCR", "SGH", "SHM", "SM",
                  "SPW", "TB", "TK", "TF", "TT", "TUK", "LVC", "WSV", "WS", "WSC", "PLYEB",
                  "REP", "CBT", "CB-", "DKD", "FBMS", "MCB", "S3696", "IS", "WEP", "PG", "WF", "WFF", "TS")
    ACC_KW = ("MOULDING", "MOLDING", "FILLER", "PANEL", "SKIN", "TOE KICK", "TOE-KICK",
              "TRAY", "ROLL", "LEG", "CROWN", "TRIM", "VALANCE", "SCRIBE", "DOOR SAMPLE",
              "DECORATIVE", "CORBEL", "SHELF")
    if c.startswith(ACC_PREFIX) or any(k in text for k in ACC_KW):
        return "Accessory"
    # Tall: pantry / oven / utility cabinets
    if (c.startswith(("U-", "UC", "UOC", "UCB", "UCD", "O-", "TDEP", "DKD", "PR-", "PR")) 
            or "PANTRY" in text or "UTILITY" in text or "OVEN" in text or "TALL" in text):
        return "Tall Cabinet"
    # Vanity
    if c.startswith(("V", "VB", "VDB", "VA", "VSDB")) or "VANITY" in text:
        return "Vanity"
    # Wall (incl microwave wall MW, wall blind/diagonal/corner)
    if c.startswith(("W", "WBC", "WDC", "WCA", "WR", "WER", "WOC", "MW", "MD", "MTEP", "MVEP", "LS", "LWR")) or "WALL" in text:
        return "Wall"
    # Base (default for B*/DB*/SB*/BBC*)
    if c.startswith(("FHB", "ERB", "SB", "BBC", "BBFBP", "B", "DB", "BA", "BS", "BMC", "BSD", "BSR", "CDB", "DCSB")):
        return "Base"
    return "Accessory"

# ---------------------------------------------------------------------------
# tier pricing rules
# ---------------------------------------------------------------------------
TIER_RATE = {"homeowner": 1.00, "contractor": 0.90, "wholesale": 0.80}
skus = []
unmapped_colors = set()
crossref_hits = 0

def num(x):
    try:
        v = float(x)
        return v if v > 0 else None
    except (TypeError, ValueError):
        return None

def add_sku(dcode, colorcode, family_name, door_name, door_style, wood, finish,
            cab_code, category, subcategory, description, w, h, d,
            list_price, adj_list, our_cost, order_code, crossref, supplier_desc=""):
    lp = num(list_price); al = num(adj_list) or lp; cost = num(our_cost)
    if lp is None and al is None and cost is None:
        return
    base = al or lp or 0
    sku = f"{dcode}-{colorcode}-{cab_code}"
    skus.append({
        "sku": sku, "distributor_code": dcode, "color_code": colorcode,
        "family_name": family_name, "internal_door_name": door_name,
        "door_style": door_style, "wood": wood, "finish": finish,
        "cabinet_code": cab_code, "master_code": crossref or "",
        "category": category, "subcategory": subcategory, "description": description,
        "width": w, "height": h, "depth": d,
        "list_price": round(lp, 2) if lp else "",
        "adjusted_list_price": round(al, 2) if al else "",
        "our_cost": round(cost, 2) if cost else "",
        "homeowner_price": round(base * TIER_RATE["homeowner"], 2) if base else "",
        "contractor_price": round(base * TIER_RATE["contractor"], 2) if base else "",
        "wholesale_price": round(base * TIER_RATE["wholesale"], 2) if base else "",
        "distributor_order_code": order_code or "",
        "supplier_cabinet_name": (supplier_desc or "").strip(),
        "image_url": "",
    })

# ---------------------------------------------------------------------------
# 4a) SKYLINE
# ---------------------------------------------------------------------------
ws = wb["Skyline"]
hdr = list(next(ws.iter_rows(values_only=True)))
i = 7; sky_cols = {}
while i < len(hdr):
    h = hdr[i]
    if h and i + 2 < len(hdr) and "Our Price" in str(hdr[i+1]) and "Adj List" in str(hdr[i+2]):
        sky_cols[str(h).strip()] = (i, i+1, i+2); i += 3
    else:
        i += 1
for r in ws.iter_rows(min_row=2, values_only=True):
    master = r[1]
    if not master:
        continue
    cab = resolve_cabinet(master, r[3], r[4])
    order_code = str(r[4]).strip() if r[4] else str(master).strip()
    if cab:
        crossref_hits += 1
        cc, cat, sub, desc = cab["master_code"], cab["category"], cab["subcategory"], cab["description"]
        w, h2, d = cab["width"], cab["height"], cab["depth"]
    else:
        cc = str(master).strip(); cat = guess_category(cc); sub = ""; desc = (str(r[5]).strip() if r[5] else ""); w = h2 = d = None
    for code, (li, oi, ai) in sky_cols.items():
        info = color_map.get(("SKY", code))
        if not info:
            unmapped_colors.add(f"SKY:{code}"); continue
        add_sku("SKY", code, info["our_name"], info["door_name"], info["door_style"],
                info["wood"], info["finish"], cc, cat, sub, desc, w, h2, d,
                r[li], r[ai], r[oi], order_code, cab["master_code"] if cab else "",
                supplier_desc=(str(r[5]).strip() if r[5] else (str(r[2]).strip() if r[2] else "")))

# ---------------------------------------------------------------------------
# 4b) US CABINET DEPOT
# ---------------------------------------------------------------------------
ws = wb["us cabinet depot "]
hdr = list(next(ws.iter_rows(values_only=True)))
ucd_cols = {}
for idx in range(7, len(hdr)):
    h = hdr[idx]
    if h:
        m = re.search(r'\(([A-Z]+)\)', str(h))
        if m: ucd_cols[m.group(1)] = idx
for r in ws.iter_rows(min_row=2, values_only=True):
    sku_code = r[0]
    if not sku_code:
        continue
    cab = resolve_cabinet(sku_code)
    order_code = str(sku_code).strip()
    if cab:
        crossref_hits += 1
        cc, cat, sub, desc = cab["master_code"], cab["category"], cab["subcategory"], cab["description"]
        w, h2, d = cab["width"], cab["height"], cab["depth"]
    else:
        cc = str(sku_code).strip(); cat = guess_category(cc); sub = ""; desc = (str(r[1]).strip() if r[1] else ""); w = h2 = d = None
    for code, idx in ucd_cols.items():
        info = color_map.get(("UCD", code))
        if not info:
            unmapped_colors.add(f"UCD:{code}"); continue
        price = r[idx]
        add_sku("UCD", code, info["our_name"], info["door_name"], info["door_style"],
                info["wood"], info["finish"], cc, cat, sub, desc, w, h2, d,
                price, price, None, order_code, cab["master_code"] if cab else "",
                supplier_desc=(str(r[1]).strip() if r[1] else ""))

# ---------------------------------------------------------------------------
# 4c) CLARK & SON  (color blocks)
# ---------------------------------------------------------------------------
cs_name_to = {}  # UPPER name -> (code, family_name, door_name, style, wood, finish)
for (dc, code), info in color_map.items():
    if dc == "CS":
        cs_name_to[info["door_name"].upper()] = (code, info["our_name"], info["door_name"], info["door_style"], info["wood"], info["finish"])
        cs_name_to[info["our_name"].upper()] = (code, info["our_name"], info["door_name"], info["door_style"], info["wood"], info["finish"])
for nm, (code, fam) in EXTRA_CS_COLORS.items():
    cs_name_to[nm] = (code, fam, fam, "Shaker", "", "")

ws = wb["Clark and Sons"]
cur = None  # tuple
for r in ws.iter_rows(min_row=1, values_only=True):
    c0, c1, c4 = r[0], r[1], (r[4] if len(r) > 4 else None)
    base_price = r[7] if len(r) > 7 else None
    adj = r[11] if len(r) > 11 else None
    cost = r[12] if len(r) > 12 else None
    if c4 and isinstance(c4, str) and c4.strip():
        nm = c4.strip().upper()
        if nm in ("UNIVERSAL ROLL OUT TRAYS",):
            cur = None; continue
        cur = cs_name_to.get(nm)
        if cur is None:
            unmapped_colors.add(f"CS-name:{nm}")
        continue
    master = c1 or c0
    if not master or master == "Master Code":
        continue
    if cur is None:
        continue
    cab = resolve_cabinet(master, c0)
    order_code = str(c0).strip() if c0 else str(master).strip()
    code, fam, door, style, wood, finish = cur
    desc_fallback = (str(r[2]).strip() if len(r) > 2 and r[2] else "")
    if cab:
        crossref_hits += 1
        cc, cat, sub, desc = cab["master_code"], cab["category"], cab["subcategory"], cab["description"] or desc_fallback
        w, h2, d = cab["width"], cab["height"], cab["depth"]
    else:
        cc = str(master).strip(); cat = guess_category(cc); sub = ""; desc = desc_fallback; w = h2 = d = None
    cs_supplier_desc = (str(r[6]).strip() if len(r) > 6 and r[6] else desc_fallback)
    add_sku("CS", code, fam, door, style, wood, finish, cc, cat, sub, desc, w, h2, d,
            base_price, adj, cost, order_code, cab["master_code"] if cab else "",
            supplier_desc=cs_supplier_desc)

wb.close()

# ---------------------------------------------------------------------------
# 5) de-dupe + outputs
# ---------------------------------------------------------------------------
# post-process: normalize/backfill category, clean descriptions, flag non-products
JUNK_DESC = re.compile(r'^[-\s"]*W x[\s"]*H x[\s"]*D$')
CAT_NORMALIZE = {
    "American Disability Act Cabinets": "ADA",
    "ADA Cabinets": "ADA",
    "Tall": "Tall Cabinet",
    "Accessories": "Accessory",
    "Trim": "Accessory",
    "Other": "",
}
def plain_cabinet_name(row):
    """Human words for a cabinet, e.g. 'Drawer Base 21 (3 Drawer)'."""
    cat = row.get("category", "") or ""
    sub = row.get("subcategory", "") or ""
    w = row.get("width", "")
    try:
        wtxt = str(int(float(w))) if w not in ("", None) else ""
    except (ValueError, TypeError):
        wtxt = str(w)
    base = {"Base": "Base Cabinet", "Wall": "Wall Cabinet", "Tall Cabinet": "Tall Cabinet",
            "Vanity": "Vanity", "ADA": "ADA Cabinet", "Accessory": "Accessory"}.get(cat, cat or "Cabinet")
    parts = [base]
    if wtxt:
        parts.append(wtxt + '"')
    if sub and sub.lower() not in base.lower():
        parts.append(f"({sub})")
    return " ".join(parts).strip()

for row in skus:
    cat = (row["category"] or "").strip()
    cat = CAT_NORMALIZE.get(cat, cat)
    if not cat:
        cat = guess_category(row["cabinet_code"], row["description"])
    row["category"] = cat
    d = (row["description"] or "").strip()
    if not d or JUNK_DESC.match(d):
        sub = row["subcategory"] or row["category"]
        row["description"] = f"{sub} {row['cabinet_code']}".strip()
    row["non_product"] = "Y" if is_non_product(row["cabinet_code"], row["description"]) else ""
    row["master_cabinet_name"] = plain_cabinet_name(row)

seen = {}
for row in skus:
    seen.setdefault(row["sku"], row)
final = list(seen.values())
final.sort(key=lambda x: (x["distributor_code"], x["family_name"], x["category"], x["cabinet_code"]))

cols = ["sku", "distributor_code", "color_code", "family_name", "internal_door_name",
        "door_style", "wood", "finish", "cabinet_code", "master_code", "category",
        "subcategory", "description", "width", "height", "depth",
        "list_price", "adjusted_list_price", "our_cost",
        "homeowner_price", "contractor_price", "wholesale_price",
        "distributor_order_code", "supplier_cabinet_name", "non_product", "master_cabinet_name", "image_url"]

def write_csv(path, rowset):
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for row in rowset:
            w.writerow(row)

write_csv(os.path.join(OUT_DIR, "master_skus.csv"), final)
for dc in ("CS", "SKY", "UCD"):
    write_csv(os.path.join(OUT_DIR, f"master_skus_{dc}.csv"), [r for r in final if r["distributor_code"] == dc])

by_dist = defaultdict(int)
by_family = defaultdict(int)
for row in final:
    by_dist[row["distributor_code"]] += 1
    by_family[(row["distributor_code"], row["family_name"])] += 1

lines = [f"TOTAL UNIQUE SKUS: {len(final)}", "", "BY DISTRIBUTOR:"]
for d, c in sorted(by_dist.items()):
    lines.append(f"  {DIST_NAME[d]} ({d}): {c}")
lines.append(f"\nCross-reference hits to master catalog: {crossref_hits}")
lines.append(f"DISTINCT FAMILIES (distributor x color): {len(by_family)}")
lines.append(f"UNMAPPED COLORS ({len(unmapped_colors)}): {sorted(unmapped_colors)}")
summary = "\n".join(lines)
with open(os.path.join(OUT_DIR, "master_skus_summary.txt"), "w") as f:
    f.write(summary + "\n")
print(summary)
print("\nWrote per-distributor CSVs + master_skus.csv to", OUT_DIR)
