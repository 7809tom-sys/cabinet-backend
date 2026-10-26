#!/usr/bin/env python3
"""Download + validate sourced per-style room scene & door images.

Reads source_style_images.json, attempts to download each room_scene_url and
door_image_url, validates it is a real raster image (via PIL), and writes the
good files into ./style_images/ with deterministic names keyed by internal name.
Outputs a manifest (style_image_manifest.json) describing what succeeded.
"""
import json
import os
import re
import sys
import hashlib
from io import BytesIO

import requests
from PIL import Image

SRC = "/home/ubuntu/source_style_images.json"
OUT_DIR = "/home/ubuntu/cabinet-dealz/style_images"
MANIFEST = "/home/ubuntu/cabinet-dealz/scripts/style_image_manifest.json"

os.makedirs(OUT_DIR, exist_ok=True)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    "Referer": "https://www.google.com/",
}


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def try_download(url: str, min_w=200, min_h=200):
    """Return (bytes, ext, w, h) if a valid image >= min size, else None."""
    if not url or url.strip().upper() == "NONE":
        return None
    url = url.strip()
    if not url.lower().startswith("http"):
        return None
    try:
        r = requests.get(url, headers=HEADERS, timeout=25, stream=True)
        if r.status_code != 200:
            return None
        ctype = r.headers.get("Content-Type", "").lower()
        if "html" in ctype or "json" in ctype or "xml" in ctype:
            return None
        data = r.content
        if len(data) < 2000:
            return None
        img = Image.open(BytesIO(data))
        img.verify()
        img2 = Image.open(BytesIO(data))
        w, h = img2.size
        if w < min_w or h < min_h:
            return None
        fmt = (img2.format or "").lower()
        ext = {"jpeg": "jpg", "png": "png", "webp": "webp", "gif": "gif"}.get(fmt)
        if not ext:
            return None
        return data, ext, w, h
    except Exception:
        return None


def main():
    with open(SRC) as f:
        results = json.load(f)["results"]

    manifest = []
    for row in results:
        out = row.get("output") or {}
        name = out.get("internal_name") or row.get("input", "").split("|")[0].strip()
        s = slug(name)
        entry = {
            "internal_name": name,
            "finish_match": out.get("finish_match"),
            "notes": out.get("notes"),
            "room_file": None,
            "door_file": None,
            "room_dims": None,
            "door_dims": None,
            "room_src": out.get("room_scene_url"),
            "door_src": out.get("door_image_url"),
        }
        room = try_download(out.get("room_scene_url"), min_w=400, min_h=300)
        if room:
            data, ext, w, h = room
            fn = f"{s}-room.{ext}"
            with open(os.path.join(OUT_DIR, fn), "wb") as fh:
                fh.write(data)
            entry["room_file"] = fn
            entry["room_dims"] = [w, h]
        door = try_download(out.get("door_image_url"), min_w=150, min_h=150)
        if door:
            data, ext, w, h = door
            fn = f"{s}-door.{ext}"
            with open(os.path.join(OUT_DIR, fn), "wb") as fh:
                fh.write(data)
            entry["door_file"] = fn
            entry["door_dims"] = [w, h]
        status = []
        if not entry["room_file"]:
            status.append("NO-ROOM")
        if not entry["door_file"]:
            status.append("NO-DOOR")
        print(f"{name:24s} room={entry['room_file'] or '-':30s} door={entry['door_file'] or '-':30s} {' '.join(status)}")
        manifest.append(entry)

    with open(MANIFEST, "w") as f:
        json.dump(manifest, f, indent=2)

    rooms = sum(1 for m in manifest if m["room_file"])
    doors = sum(1 for m in manifest if m["door_file"])
    print(f"\nTOTAL: {len(manifest)} styles | rooms={rooms} | doors={doors}")
    print(f"Missing room: {[m['internal_name'] for m in manifest if not m['room_file']]}")
    print(f"Missing door: {[m['internal_name'] for m in manifest if not m['door_file']]}")


if __name__ == "__main__":
    main()
