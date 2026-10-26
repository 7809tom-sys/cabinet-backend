#!/usr/bin/env python3
"""Build a labeled contact sheet of all 61 family room scenes + door images
so we can visually verify each photo matches its family color.
Reads the upload map + manifest to locate local downloaded files.
"""
import json, os, glob, math
from PIL import Image, ImageDraw, ImageFont

ROOT = "/home/ubuntu/cabinet-dealz"
AUDIT = json.load(open(f"{ROOT}/scripts/image-audit.json"))

# Find local downloaded images (room/door) saved by the earlier fetch scripts.
# They live under scripts/style-images/ as <slug>-room.* / <slug>-door.*
def slug(name):
    return (name or "").lower().replace(" ", "-").replace("/", "-")

candidates = {}
for p in glob.glob(f"{ROOT}/style_images/**/*", recursive=True):
    if os.path.isfile(p) and p.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
        candidates[os.path.basename(p).lower()] = p

def find(ourname, kind):
    s = slug(ourname)
    # try exact slug-room / slug-door
    for ext in ("webp", "jpg", "jpeg", "png"):
        key = f"{s}-{kind}.{ext}"
        if key in candidates:
            return candidates[key]
    # fuzzy: any file containing slug and kind
    for k, v in candidates.items():
        if s in k and kind in k:
            return v
    return None

rows = AUDIT
cols = 6
rrows = math.ceil(len(rows) / cols)
CW, CH = 320, 280
sheet = Image.new("RGB", (cols * CW, rrows * CH), "white")
draw = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 16)
    small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 13)
except Exception:
    font = small = ImageFont.load_default()

missing = []
for i, r in enumerate(rows):
    cx, cy = (i % cols) * CW, (i // cols) * CH
    fp = find(r["ourName"], "room") or find(r["ourName"], "door")
    if fp:
        try:
            im = Image.open(fp).convert("RGB")
            im.thumbnail((CW - 16, CH - 70))
            sheet.paste(im, (cx + 8, cy + 8))
        except Exception as e:
            missing.append((r["ourName"], str(e)))
    else:
        missing.append((r["ourName"], "no local file"))
        draw.rectangle([cx + 8, cy + 8, cx + CW - 8, cy + CH - 70], outline="red", width=2)
    label = f'{r["ourName"]}'
    sub = f'{(r.get("color") or "")[:30]}'
    draw.text((cx + 8, cy + CH - 58), label, fill="black", font=font)
    draw.text((cx + 8, cy + CH - 36), sub, fill="#555", font=small)
    draw.text((cx + 8, cy + CH - 18), f'<= {r.get("distributorName","")}'[:38], fill="#888", font=small)

out = f"{ROOT}/scripts/verify_room_contact.png"
sheet.save(out)
print("Saved", out)
print("MISSING/UNRESOLVED LOCAL FILES:", len(missing))
for m in missing:
    print("  -", m)
