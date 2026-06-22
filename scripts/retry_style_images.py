#!/usr/bin/env python3
"""Retry pass for styles missing a room or door image.

Strategy per missing field:
  - Try the original URL again with a per-host Referer (defeats some hotlink).
  - Try the opposite field's URL (door->room fallback or room->door fallback).
  - Try any URLs that appear inside source_pages if they look like images.
Also fixes internal_name that echoed the whole pipe-delimited input.
"""
import json
import os
import re
from io import BytesIO
from urllib.parse import urlparse

import requests
from PIL import Image

SRC = "/home/ubuntu/source_style_images.json"
OUT_DIR = "/home/ubuntu/cabinet-dealz/style_images"
MANIFEST = "/home/ubuntu/cabinet-dealz/scripts/style_image_manifest.json"

os.makedirs(OUT_DIR, exist_ok=True)


def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def headers_for(url):
    host = urlparse(url).netloc
    return {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 "
        "(KHTML, like Gecko) Version/17.0 Safari/605.1.15",
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "Referer": f"https://{host}/",
        "Sec-Fetch-Dest": "image",
        "Sec-Fetch-Mode": "no-cors",
        "Sec-Fetch-Site": "same-origin",
    }


def try_download(url, min_w, min_h):
    if not url or url.strip().upper() == "NONE" or not url.strip().lower().startswith("http"):
        return None
    url = url.strip()
    try:
        r = requests.get(url, headers=headers_for(url), timeout=25)
        if r.status_code != 200:
            return None
        ctype = r.headers.get("Content-Type", "").lower()
        if any(x in ctype for x in ("html", "json", "xml")):
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


def candidates_from_pages(pages):
    out = []
    for tok in re.split(r"[ ,]+", pages or ""):
        if re.search(r"\.(jpg|jpeg|png|webp)(\?|$)", tok, re.I):
            out.append(tok)
    return out


def main():
    with open(SRC) as f:
        results = json.load(f)["results"]
    with open(MANIFEST) as f:
        manifest = {m["internal_name"]: m for m in json.load(f)}

    # rebuild a clean manifest keyed by corrected internal name
    fixed = []
    for row in results:
        out = row.get("output") or {}
        name = (out.get("internal_name") or "").strip()
        if "|" in name:  # echoed whole input -> take first field
            name = name.split("|")[0].strip()
        if not name:
            name = row.get("input", "").split("|")[0].strip()
        s = slug(name)
        room_url = out.get("room_scene_url")
        door_url = out.get("door_image_url")
        pages = out.get("source_pages")

        # find existing files (may be under messy slug from first pass)
        old = manifest.get(out.get("internal_name") or name) or manifest.get(name) or {}
        entry = {
            "internal_name": name,
            "finish_match": out.get("finish_match"),
            "notes": out.get("notes"),
            "room_file": None,
            "door_file": None,
            "room_dims": old.get("room_dims"),
            "door_dims": old.get("door_dims"),
            "room_src": room_url,
            "door_src": door_url,
        }
        # keep already-downloaded files if present under clean slug
        for kind in ("room", "door"):
            for ext in ("jpg", "png", "webp", "gif"):
                fn = f"{s}-{kind}.{ext}"
                if os.path.exists(os.path.join(OUT_DIR, fn)):
                    entry[f"{kind}_file"] = fn
                    break

        # retry room
        if not entry["room_file"]:
            for cand in [room_url, door_url] + candidates_from_pages(pages):
                got = try_download(cand, 400, 300)
                if got:
                    data, ext, w, h = got
                    fn = f"{s}-room.{ext}"
                    with open(os.path.join(OUT_DIR, fn), "wb") as fh:
                        fh.write(data)
                    entry["room_file"] = fn
                    entry["room_dims"] = [w, h]
                    break
        # retry door
        if not entry["door_file"]:
            for cand in [door_url, room_url] + candidates_from_pages(pages):
                got = try_download(cand, 150, 150)
                if got:
                    data, ext, w, h = got
                    fn = f"{s}-door.{ext}"
                    with open(os.path.join(OUT_DIR, fn), "wb") as fh:
                        fh.write(data)
                    entry["door_file"] = fn
                    entry["door_dims"] = [w, h]
                    break
        fixed.append(entry)

    with open(MANIFEST, "w") as f:
        json.dump(fixed, f, indent=2)

    rooms = sum(1 for m in fixed if m["room_file"])
    doors = sum(1 for m in fixed if m["door_file"])
    print(f"TOTAL {len(fixed)} | rooms={rooms} doors={doors}")
    print("Missing room:", [m["internal_name"] for m in fixed if not m["room_file"]])
    print("Missing door:", [m["internal_name"] for m in fixed if not m["door_file"]])


if __name__ == "__main__":
    main()
