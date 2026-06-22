#!/usr/bin/env python3
"""Map each door style's manifest files to their CDN URLs and emit UPDATE SQL."""
import csv, json, os

MANIFEST = "/home/ubuntu/cabinet-dealz/scripts/style_image_manifest.json"
UPLOAD = "/home/ubuntu/cabinet-dealz/scripts/upload_map.csv"
OUT = "/home/ubuntu/cabinet-dealz/scripts/update_style_images.sql"

# filename -> cdn url
url_by_file = {}
with open(UPLOAD) as f:
    for row in csv.reader(f):
        if len(row) == 2:
            url_by_file[row[0].strip()] = row[1].strip()

manifest = json.load(open(MANIFEST))


def esc(s):
    return s.replace("'", "''")


lines = []
missing = []
for e in manifest:
    name = e["internal_name"]
    room_f = e.get("room_file")
    door_f = e.get("door_file")
    room_url = url_by_file.get(room_f) if room_f else None
    door_url = url_by_file.get(door_f) if door_f else None
    if not room_url and not door_url:
        missing.append(name)
        continue
    sets = []
    if room_url:
        sets.append(f"roomSceneImageUrl = '{esc(room_url)}'")
    if door_url:
        sets.append(f"doorSampleImageUrl = '{esc(door_url)}'")
    lines.append(
        f"UPDATE door_styles SET {', '.join(sets)} WHERE ourName = '{esc(name)}';"
    )

with open(OUT, "w") as f:
    f.write("\n".join(lines) + "\n")

print(f"Wrote {len(lines)} UPDATE statements to {OUT}")
if missing:
    print("No image mapped for:", missing)
# show a sample
print("\n".join(lines[:3]))
