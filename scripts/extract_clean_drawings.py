#!/usr/bin/env python3
"""
Re-extract cabinet line drawings from Capital spec book pages.
Produces clean line-art-only PNGs with no headers, spec tables, or red dimension callouts.
"""
from PIL import Image
import numpy as np
import os

PAGES_DIR = "/home/ubuntu/spec_book_pages"
OUT_DIR = "/home/ubuntu/webdev-static-assets/cabinet-drawings-v2"
os.makedirs(OUT_DIR, exist_ok=True)

OFFSET = 27  # spec book page N -> PDF page N+27

def pdf_page(spec_page):
    return spec_page + OFFSET

def find_product_headers(arr):
    """
    Find the y-ranges of the dark navy product section header bars.
    Real headers: at least 20px tall, start below y=200, span full left width.
    """
    h, w = arr.shape[:2]
    left = arr[:, :490]
    dark_rows = np.sum((left[:,:,0] < 80) & (left[:,:,1] < 80) & (left[:,:,2] < 130), axis=1)

    in_header = False
    start = 0
    all_spans = []
    for y in range(h):
        if dark_rows[y] > 100:
            if not in_header:
                start = y
                in_header = True
        else:
            if in_header:
                all_spans.append((start, y - 1))
                in_header = False

    # Filter: must be >= 20px tall and start below y=200
    headers = [(s, e) for s, e in all_spans if (e - s) >= 20 and s >= 200]
    return headers

def to_clean_bw(arr):
    """
    Convert to pure black-and-white keeping only dark black line art.
    Strategy: a pixel is 'ink' only if it is dark in ALL three channels
    (i.e., truly black/dark gray). Red, pink, blue annotations are excluded
    because they have high R or high B values.
    Threshold: pixel is ink if max(R,G,B) < 160.
    Everything else becomes white.
    """
    result = np.full_like(arr, 255)  # start all white
    # Keep only pixels that are dark in all channels (true black line art)
    is_ink = (arr[:,:,0] < 160) & (arr[:,:,1] < 160) & (arr[:,:,2] < 160)
    result[is_ink] = [0, 0, 0]  # render as pure black
    return result

def auto_trim_to_ink(arr, padding=22, threshold=180):
    """
    Trim to bounding box of dark black ink pixels only.
    Returns (x0, y0, x1, y1) crop box.
    """
    h, w = arr.shape[:2]
    is_ink = (arr[:,:,0] < threshold) & (arr[:,:,1] < threshold) & (arr[:,:,2] < threshold)
    rows = np.any(is_ink, axis=1)
    cols = np.any(is_ink, axis=0)
    if not rows.any() or not cols.any():
        return (0, 0, w, h)
    rmin, rmax = int(np.where(rows)[0][0]), int(np.where(rows)[0][-1])
    cmin, cmax = int(np.where(cols)[0][0]), int(np.where(cols)[0][-1])
    return (
        max(0, cmin - padding),
        max(0, rmin - padding),
        min(w, cmax + padding + 1),
        min(h, rmax + padding + 1),
    )

def extract_drawing(page_path, block_index, output_path):
    img = Image.open(page_path).convert("RGB")
    arr = np.array(img)
    h, w = arr.shape[:2]

    headers = find_product_headers(arr)

    if len(headers) < block_index + 1:
        # Fallback: hardcoded estimates
        if block_index == 0:
            y0, y1 = 336, 860
        else:
            y0, y1 = 942, 1530
        print(f"  FALLBACK block {block_index}: y={y0}..{y1} (only {len(headers)} headers found)")
    else:
        y0 = headers[block_index][1] + 2  # start just after header bar
        if block_index + 1 < len(headers):
            y1 = headers[block_index + 1][0] - 5
        else:
            y1 = h - 100

    # Drawing is in left ~45% of page (before the spec table starts)
    x0, x1 = 20, 560
    zone = (x0, max(0, y0), x1, min(h, y1))

    if zone[3] <= zone[1]:
        raise ValueError(f"Invalid zone: {zone}")

    region = arr[zone[1]:zone[3], zone[0]:zone[2]].copy()

    # Convert to clean B&W: keep only true black line art, discard all color annotations
    region = to_clean_bw(region)

    # Auto-trim to black line art
    box = auto_trim_to_ink(region, padding=22, threshold=180)
    cropped = region[box[1]:box[3], box[0]:box[2]]

    if cropped.size == 0:
        raise ValueError("Empty crop after trim")

    # Output as square white canvas
    ch, cw = cropped.shape[:2]
    size = max(cw, ch, 180)
    canvas = np.full((size, size, 3), 255, dtype=np.uint8)
    ox = (size - cw) // 2
    oy = (size - ch) // 2
    canvas[oy:oy+ch, ox:ox+cw] = cropped

    out_img = Image.fromarray(canvas)
    out_img.save(output_path, "PNG", optimize=True)
    print(f"  Saved {os.path.basename(output_path)}: {size}x{size} (zone y={y0}..{y1})")
    return output_path

FAMILY_DRAWINGS = {
    # Base cabinets
    "base_full_height_single":    {"spec": 2,  "block": 0},
    "base_full_height_double":    {"spec": 3,  "block": 0},
    "base_single_door_drawer":    {"spec": 3,  "block": 1},
    "base_double_door_drawer":    {"spec": 5,  "block": 0},
    "base_double_door_2drawer":   {"spec": 6,  "block": 0},
    "base_sink_single":           {"spec": 7,  "block": 0},
    "base_sink_double":           {"spec": 7,  "block": 1},
    "base_farm_sink":             {"spec": 8,  "block": 0},
    "base_drawer_2":              {"spec": 9,  "block": 0},
    "base_drawer_3":              {"spec": 10, "block": 0},
    "base_corner_easy_reach":     {"spec": 12, "block": 0},
    "base_blind":                 {"spec": 13, "block": 0},
    # Wall cabinets
    "wall_single_door_30h":       {"spec": 29, "block": 0},
    "wall_double_door_30h":       {"spec": 29, "block": 1},
    "wall_single_door_36h":       {"spec": 30, "block": 0},
    "wall_double_door_36h":       {"spec": 30, "block": 1},
    "wall_single_door_42h":       {"spec": 31, "block": 0},
    "wall_double_door_42h":       {"spec": 31, "block": 1},
    "wall_corner_diagonal":       {"spec": 32, "block": 0},
    "wall_bridge":                {"spec": 33, "block": 1},
    "wall_refrigerator":          {"spec": 35, "block": 0},
    "wall_glass_door":            {"spec": 36, "block": 0},
    # Tall cabinets
    "tall_utility_2door":         {"spec": 43, "block": 0},
    "tall_utility_4door":         {"spec": 43, "block": 1},
    "tall_oven":                  {"spec": 44, "block": 0},
    # Vanity cabinets
    "vanity_sink_base_single":    {"spec": 46, "block": 0},
    "vanity_sink_base_double":    {"spec": 47, "block": 0},
    "vanity_drawer":              {"spec": 48, "block": 0},
    "vanity_combo":               {"spec": 49, "block": 0},
}

results = {}
errors = []
for family, info in FAMILY_DRAWINGS.items():
    page_num = pdf_page(info["spec"])
    page_path = os.path.join(PAGES_DIR, f"page-{page_num:02d}.png")
    if not os.path.exists(page_path):
        print(f"  MISSING: {page_path}")
        errors.append(family)
        continue
    out_path = os.path.join(OUT_DIR, f"{family}.png")
    try:
        extract_drawing(page_path, info["block"], out_path)
        results[family] = out_path
    except Exception as e:
        print(f"  ERROR {family}: {e}")
        errors.append(family)

print(f"\nExtracted {len(results)}/{len(FAMILY_DRAWINGS)} clean drawings to {OUT_DIR}")
if errors:
    print(f"Errors: {errors}")
