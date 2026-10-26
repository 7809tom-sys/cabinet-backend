#!/usr/bin/env python3
"""
Extract generic line drawings from Capital spec book PDF pages.
Offset: spec book page N = page-(N+27).png
Each product block: first block y=200-870, second block y=870-1520
Drawing in left portion: x=30-540
"""
from PIL import Image
import os

PAGES_DIR = "/home/ubuntu/spec_book_pages"
OUT_DIR = "/home/ubuntu/webdev-static-assets/cabinet-drawings"
os.makedirs(OUT_DIR, exist_ok=True)

OFFSET = 27  # spec page N -> PDF page N+27

def pdf_page(spec_page):
    return spec_page + OFFSET

BLOCK1 = (30, 200, 540, 870)   # first product block drawing area
BLOCK2 = (30, 870, 540, 1520)  # second product block drawing area

FAMILY_DRAWINGS = {
    # Base cabinets
    "base_full_height_single":    {"spec": 2,  "block": BLOCK1, "label": "Full Height Single Door Base"},
    "base_full_height_double":    {"spec": 3,  "block": BLOCK1, "label": "Full Height Double Door Base"},
    "base_single_door_drawer":    {"spec": 3,  "block": BLOCK2, "label": "Single Door / Single Drawer Base"},
    "base_double_door_drawer":    {"spec": 5,  "block": BLOCK1, "label": "Double Door / Single Drawer Base"},
    "base_double_door_2drawer":   {"spec": 6,  "block": BLOCK1, "label": "Double Door / Double Drawer Base"},
    "base_sink_single":           {"spec": 7,  "block": BLOCK1, "label": "Sink Base (Single Door)"},
    "base_sink_double":           {"spec": 7,  "block": BLOCK2, "label": "Sink Base (Double Door)"},
    "base_farm_sink":             {"spec": 8,  "block": BLOCK1, "label": "Farm Sink Base"},
    "base_drawer_2":              {"spec": 9,  "block": BLOCK1, "label": "Two Drawer Base"},
    "base_drawer_3":              {"spec": 10, "block": BLOCK1, "label": "Three Drawer Base"},
    "base_corner_easy_reach":     {"spec": 12, "block": BLOCK1, "label": "Corner Easy Reach Base"},
    "base_blind":                 {"spec": 13, "block": BLOCK1, "label": "Blind Base Corner"},
    # Wall cabinets
    "wall_single_door_30h":       {"spec": 29, "block": BLOCK1, "label": "Single Door Wall Cabinet (30\"H)"},
    "wall_double_door_30h":       {"spec": 29, "block": BLOCK2, "label": "Double Door Wall Cabinet (30\"H)"},
    "wall_single_door_36h":       {"spec": 30, "block": BLOCK1, "label": "Single Door Wall Cabinet (36\"H)"},
    "wall_double_door_36h":       {"spec": 30, "block": BLOCK2, "label": "Double Door Wall Cabinet (36\"H)"},
    "wall_single_door_42h":       {"spec": 31, "block": BLOCK1, "label": "Single Door Wall Cabinet (42\"H)"},
    "wall_double_door_42h":       {"spec": 31, "block": BLOCK2, "label": "Double Door Wall Cabinet (42\"H)"},
    "wall_corner_diagonal":       {"spec": 32, "block": BLOCK1, "label": "Diagonal Corner Wall Cabinet"},
    "wall_bridge":                {"spec": 33, "block": BLOCK2, "label": "Bridge Wall Cabinet"},
    "wall_refrigerator":          {"spec": 35, "block": BLOCK1, "label": "Refrigerator Wall Cabinet"},
    "wall_glass_door":            {"spec": 36, "block": BLOCK1, "label": "Glass Door Wall Cabinet"},
    # Tall cabinets
    "tall_utility_2door":         {"spec": 43, "block": BLOCK1, "label": "Utility Cabinet (2 Door)"},
    "tall_utility_4door":         {"spec": 43, "block": BLOCK2, "label": "Utility Cabinet (4 Door)"},
    "tall_oven":                  {"spec": 44, "block": BLOCK1, "label": "Oven Cabinet"},
    # Vanity cabinets
    "vanity_sink_base_single":    {"spec": 46, "block": BLOCK1, "label": "Vanity Sink Base (Single Door)"},
    "vanity_sink_base_double":    {"spec": 47, "block": BLOCK1, "label": "Vanity Sink Base (Double Door)"},
    "vanity_drawer":              {"spec": 48, "block": BLOCK1, "label": "Vanity Drawer Base"},
    "vanity_combo":               {"spec": 49, "block": BLOCK1, "label": "Vanity Combo Base"},
}

results = {}
for family, info in FAMILY_DRAWINGS.items():
    page_num = pdf_page(info["spec"])
    page_path = os.path.join(PAGES_DIR, f"page-{page_num:02d}.png")
    if not os.path.exists(page_path):
        print(f"  MISSING: {page_path}")
        continue
    img = Image.open(page_path)
    crop = info["block"]
    w, h = img.size
    crop = (max(0, crop[0]), max(0, crop[1]), min(w, crop[2]), min(h, crop[3]))
    cropped = img.crop(crop)
    bordered = Image.new("RGB", (cropped.width + 20, cropped.height + 20), (255, 255, 255))
    bordered.paste(cropped, (10, 10))
    out_path = os.path.join(OUT_DIR, f"{family}.png")
    bordered.save(out_path, "PNG", optimize=True)
    results[family] = {"path": out_path, "label": info["label"], "page": page_num}
    print(f"  Saved {family} (spec pg {info['spec']}, PDF pg {page_num}): {bordered.width}x{bordered.height}")

print(f"\nExtracted {len(results)} line drawings to {OUT_DIR}")
