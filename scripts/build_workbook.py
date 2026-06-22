#!/usr/bin/env python3
"""
Build Cabinet_Dealz_Master_SKUs.xlsx from the per-distributor SKU CSVs + the
door-style image CSV exported from the DB.

Tabs:
  1. README            - how to use this workbook
  2. Door Styles       - ONE row per door style (= one specific color = one image).
                         Door thumbnail embedded so the user verifies images by eye.
                         This is the sheet the user actually manages.
  3. CS / SKY / UCD     - SKU price tabs grouped by door style (family) for reference.
  4. Summary           - counts.
"""
import csv, os
from collections import defaultdict, OrderedDict
import xlsxwriter
from PIL import Image

BASE = "/home/ubuntu/cabinet-dealz"
EXPORTS = os.path.join(BASE, "exports")
IMG_DIR = os.path.join(BASE, "style_images")
THUMB_DIR = os.path.join(EXPORTS, "_thumbs")
os.makedirs(THUMB_DIR, exist_ok=True)
OUT = os.path.join(EXPORTS, "Cabinet_Dealz_Master_SKUs.xlsx")

DIST_NAME = {"CS": "Clark & Son", "SKY": "Skyline", "UCD": "US Cabinet Depot"}

# ---- load SKUs ----
def load_csv(path):
    with open(path, newline="") as f:
        return list(csv.DictReader(f))

all_skus = load_csv(os.path.join(EXPORTS, "master_skus.csv"))

# ---- load DB door-style images, key by ourName ----
db_imgs = {}
p = os.path.join(EXPORTS, "db_door_style_images.csv")
if os.path.exists(p):
    for r in load_csv(p):
        db_imgs[r["ourName"].strip().lower()] = r

# ---- map a family (ourName) -> a local door image file ----
def slug(name):
    return name.strip().lower().replace(" ", "-").replace("/", "-")

def find_door_img(our_name):
    # try DB record's url filename first, then slug match
    rec = db_imgs.get(our_name.strip().lower())
    candidates = []
    if rec:
        for key in ("doorSampleImageUrl", "thumbnailImageUrl", "roomSceneImageUrl"):
            u = rec.get(key) or ""
            if u:
                candidates.append(os.path.basename(u))
    s = slug(our_name)
    candidates += [f"{s}-door.webp", f"{s}-door.jpg", f"{s}-room.webp", f"{s}-room.jpg"]
    for c in candidates:
        fp = os.path.join(IMG_DIR, c)
        if os.path.exists(fp):
            return fp
    return None

def make_thumb(fp, key):
    """Return a PNG thumbnail path sized to ~96px tall for embedding."""
    out = os.path.join(THUMB_DIR, key + ".png")
    if os.path.exists(out):
        return out
    try:
        im = Image.open(fp).convert("RGB")
        im.thumbnail((150, 96))
        im.save(out, "PNG")
        return out
    except Exception:
        return None

# ---- build family index: (distributor_code, color_code) -> family meta + sku count ----
families = OrderedDict()
for r in all_skus:
    key = (r["distributor_code"], r["color_code"])
    if key not in families:
        families[key] = {
            "distributor_code": r["distributor_code"],
            "color_code": r["color_code"],
            "family_name": r["family_name"],
            "internal_door_name": r["internal_door_name"],
            "door_style": r["door_style"],
            "wood": r["wood"],
            "finish": r["finish"],
            "sku_count": 0,
        }
    families[key]["sku_count"] += 1

# ---------------------------------------------------------------------------
wb = xlsxwriter.Workbook(OUT, {"nan_inf_to_errors": True})

fmt_title = wb.add_format({"bold": True, "font_size": 16, "font_color": "#1a1a1a"})
fmt_h = wb.add_format({"bold": True, "bg_color": "#2C3E50", "font_color": "white",
                       "border": 1, "align": "center", "valign": "vcenter", "text_wrap": True})
fmt_cell = wb.add_format({"border": 1, "valign": "vcenter"})
fmt_money = wb.add_format({"border": 1, "valign": "vcenter", "num_format": "$#,##0.00"})
fmt_wrap = wb.add_format({"border": 1, "valign": "vcenter", "text_wrap": True})
fmt_note = wb.add_format({"font_size": 11, "text_wrap": True, "valign": "top"})
fmt_groupband = wb.add_format({"bold": True, "bg_color": "#EAF2F8", "border": 1})

# ---------- README ----------
ws = wb.add_worksheet("README")
ws.set_column(0, 0, 110)
ws.write(0, 0, "Cabinet Dealz — Master SKU Workbook", fmt_title)
notes = [
    "",
    "HOW THIS WORKBOOK IS ORGANIZED",
    "",
    "1) DISTRIBUTOR tabs (Clark & Son / Skyline / US Cabinet Depot) — THE PRODUCTS.",
    "   • One row per unique SKU = DISTRIBUTOR-COLOR-CABINET (e.g. CS-CC-B-30).",
    "   • Grouped by door style so you can scroll family-by-family.",
    "   • IMAGE IS PER SKU (cabinet + door style): B21 Aspen and B21 Hickory are",
    "     different photos. Each row has its own image slot.",
    "   • 'Suggested Image File Name' = name your photo this (the SKU) and the uploader",
    "     will auto-attach it to the right product. The uploader also accepts",
    "     style+cabinet names (e.g. ASP-B21, B21-ASP, Aspen-B21).",
    "   • Distributor is internal only — customers never see it.",
    "   • Blank price = not offered in that line (the product does not exist there).",
    "   • 'Order Code' = the exact code we send to that distributor when ordering.",
    "",
    "2) DOOR STYLES tab — quick reference of the ~64 door styles (one specific color each).",
    "   • Shows the current door image per style. Useful as a fallback image when a",
    "     specific SKU photo has not been uploaded yet.",
    "",
    "PRICING COLUMNS: List Price, Adjusted List Price, Our Cost, then the three customer tiers:",
    "   Homeowner (retail) / Contractor / Wholesale.",
    "",
    "NON-PRODUCT rows (door samples, spray paint, swatches) are flagged and excluded from the storefront.",
]
for i, line in enumerate(notes, start=1):
    ws.write(i, 0, line, fmt_note)

# ---------- Door Styles ----------
ws = wb.add_worksheet("Door Styles")
ds_cols = ["Distributor (internal)", "Door Style Name (public)", "Color Code",
           "Door Profile", "Wood", "Finish", "# Cabinets", "Current Image", "New Image (you fill)"]
widths = [20, 26, 11, 16, 18, 28, 10, 22, 26]
for c, (name, w) in enumerate(zip(ds_cols, widths)):
    ws.set_column(c, c, w)
    ws.write(0, c, name, fmt_h)
ws.freeze_panes(1, 0)
ws.autofilter(0, 0, len(families), len(ds_cols) - 1)

row = 1
embedded = 0
for key, fam in families.items():
    ws.set_row(row, 74)
    ws.write(row, 0, DIST_NAME[fam["distributor_code"]], fmt_cell)
    ws.write(row, 1, fam["family_name"], fmt_cell)
    ws.write(row, 2, fam["color_code"], fmt_cell)
    ws.write(row, 3, fam["door_style"], fmt_cell)
    ws.write(row, 4, fam["wood"], fmt_cell)
    ws.write(row, 5, fam["finish"], fmt_wrap)
    ws.write_number(row, 6, fam["sku_count"], fmt_cell)
    fp = find_door_img(fam["family_name"])
    ws.write(row, 7, "", fmt_cell)
    ws.write(row, 8, "", fmt_cell)
    if fp:
        th = make_thumb(fp, f"{fam['distributor_code']}_{fam['color_code']}")
        if th:
            ws.insert_image(row, 7, th, {"x_offset": 4, "y_offset": 4,
                                         "object_position": 1})
            embedded += 1
    row += 1

# ---------- Distributor SKU tabs ----------
sku_cols = ["sku", "family_name", "_supplier_name", "internal_door_name", "master_cabinet_name", "cabinet_code", "category", "subcategory",
            "description", "width", "height", "depth",
            "list_price", "adjusted_list_price", "our_cost",
            "homeowner_price", "contractor_price", "wholesale_price",
            "distributor_order_code", "supplier_cabinet_name", "master_code", "non_product",
            "_suggested_filename", "image_url"]
sku_headers = ["SKU", "Public Name (Our Name)", "Supplier (PO only)", "Supplier Color (PO only)", "Master Cabinet Name", "Cabinet Code", "Category", "Sub-Category",
               "Description", "W", "H", "D",
               "List", "Adj List", "Our Cost",
               "Homeowner", "Contractor", "Wholesale",
               "Order Code", "Supplier Cabinet Name (PO only)", "Master Code", "Non-Product",
               "Suggested Image File Name", "Image URL (auto/you)"]
money_idx = {12, 13, 14, 15, 16, 17}

for dc in ("CS", "SKY", "UCD"):
    ws = wb.add_worksheet(dc)
    rows = [r for r in all_skus if r["distributor_code"] == dc]
    rows.sort(key=lambda x: (x["family_name"], x["category"], x["cabinet_code"]))
    cw = [16, 22, 18, 22, 24, 12, 14, 16, 40, 6, 6, 6, 10, 10, 10, 11, 11, 11, 13, 34, 13, 10, 24, 22]
    for c, (h, w) in enumerate(zip(sku_headers, cw)):
        ws.set_column(c, c, w)
        ws.write(0, c, h, fmt_h)
    ws.freeze_panes(1, 0)
    ws.autofilter(0, 0, len(rows), len(sku_headers) - 1)
    rr = 1
    cur_fam = None
    for r in rows:
        if r["family_name"] != cur_fam:
            cur_fam = r["family_name"]
            ws.write(rr, 0, f"▼ {cur_fam}", fmt_groupband)
            for cc in range(1, len(sku_headers)):
                ws.write(rr, cc, "", fmt_groupband)
            rr += 1
        # suggested image file name = SKU (most precise, matches uploader)
        r["_suggested_filename"] = f"{r['sku']}.jpg"  # also matches plain names via uploader
        r["_supplier_name"] = DIST_NAME.get(r["distributor_code"], r["distributor_code"])
        for c, colname in enumerate(sku_cols):
            val = r.get(colname, "")
            if c in money_idx and val not in ("", None):
                try:
                    ws.write_number(rr, c, float(val), fmt_money)
                except ValueError:
                    ws.write(rr, c, val, fmt_cell)
            elif colname == "description":
                ws.write(rr, c, val, fmt_wrap)
            else:
                ws.write(rr, c, val, fmt_cell)
        rr += 1

# ---------- Summary ----------
ws = wb.add_worksheet("Summary")
ws.set_column(0, 0, 28); ws.set_column(1, 1, 14)
ws.write(0, 0, "Summary", fmt_title)
by_dist = defaultdict(int)
by_cat = defaultdict(int)
for r in all_skus:
    by_dist[r["distributor_code"]] += 1
    by_cat[r["category"]] += 1
r0 = 2
ws.write(r0, 0, "Total unique SKUs", fmt_h); ws.write(r0, 1, len(all_skus), fmt_h); r0 += 2
ws.write(r0, 0, "By Distributor", fmt_h); ws.write(r0, 1, "SKUs", fmt_h); r0 += 1
for d in ("CS", "SKY", "UCD"):
    ws.write(r0, 0, DIST_NAME[d], fmt_cell); ws.write_number(r0, 1, by_dist[d], fmt_cell); r0 += 1
r0 += 1
ws.write(r0, 0, "By Category", fmt_h); ws.write(r0, 1, "SKUs", fmt_h); r0 += 1
for cat, n in sorted(by_cat.items(), key=lambda x: -x[1]):
    ws.write(r0, 0, cat or "(blank)", fmt_cell); ws.write_number(r0, 1, n, fmt_cell); r0 += 1
r0 += 1
ws.write(r0, 0, "Door styles (families)", fmt_cell); ws.write_number(r0, 1, len(families), fmt_cell); r0 += 1
ws.write(r0, 0, "Images embedded", fmt_cell); ws.write_number(r0, 1, embedded, fmt_cell)

wb.close()
print(f"Wrote {OUT}")
print(f"Families: {len(families)}  Images embedded: {embedded}  Total SKUs: {len(all_skus)}")
