#!/usr/bin/env python3
import json, os, math
from PIL import Image, ImageDraw, ImageFont

SI = "/home/ubuntu/cabinet-dealz/style_images"
m = json.load(open("/home/ubuntu/cabinet-dealz/scripts/style_image_manifest.json"))

cell = 260
label_h = 34
cols = 6
rows = math.ceil(len(m) / cols)
W = cols * cell
H = rows * (cell + label_h)
sheet = Image.new("RGB", (W, H), (245, 245, 245))
draw = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 14)
except Exception:
    font = ImageFont.load_default()

for i, e in enumerate(m):
    r, c = divmod(i, cols)
    x = c * cell
    y = r * (cell + label_h)
    fn = e.get("room_file")
    if fn and os.path.exists(os.path.join(SI, fn)):
        try:
            im = Image.open(os.path.join(SI, fn)).convert("RGB")
            im.thumbnail((cell - 8, cell - 8))
            sheet.paste(im, (x + 4, y + 4))
        except Exception:
            draw.rectangle([x+4, y+4, x+cell-4, y+cell-4], fill=(220, 120, 120))
    draw.rectangle([x, y + cell, x + cell, y + cell + label_h], fill=(30, 30, 40))
    draw.text((x + 6, y + cell + 8), e["internal_name"][:30], fill=(255, 255, 255), font=font)

sheet.save("/home/ubuntu/cabinet-dealz/scripts/room_contact_sheet.png")
print("saved", sheet.size)
