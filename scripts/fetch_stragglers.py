#!/usr/bin/env python3
import json, os, re
from io import BytesIO
import requests
from PIL import Image

OUT = "/home/ubuntu/cabinet-dealz/style_images"
os.makedirs(OUT, exist_ok=True)

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 "
      "(KHTML, like Gecko) Version/17.0 Safari/605.1.15")


def H(host):
    return {"User-Agent": UA, "Accept": "*/*", "Referer": f"https://{host}/"}


def save(url, fn, host, min_w=150, min_h=150):
    try:
        r = requests.get(url, headers=H(host), timeout=30)
        if r.status_code != 200:
            return f"HTTP {r.status_code}"
        data = r.content
        Image.open(BytesIO(data)).verify()
        img = Image.open(BytesIO(data))
        if img.size[0] < min_w or img.size[1] < min_h:
            return f"too small {img.size}"
        with open(os.path.join(OUT, fn), "wb") as f:
            f.write(data)
        return f"OK {img.size}"
    except Exception as e:
        return f"ERR {e}"


def shopify_images(collection_handle_or_product, host="homecabinets.com"):
    """Pull image URLs from a shopify products.json collection or product."""
    urls = []
    for path in (f"https://{host}/collections/{collection_handle_or_product}/products.json?limit=5",
                 f"https://{host}/products/{collection_handle_or_product}.json"):
        try:
            r = requests.get(path, headers=H(host), timeout=30)
            if r.status_code != 200:
                continue
            j = r.json()
            prods = j.get("products") or ([j.get("product")] if j.get("product") else [])
            for p in prods:
                for im in p.get("images", []):
                    if im.get("src"):
                        urls.append(im["src"])
            if urls:
                break
        except Exception:
            continue
    return urls


# Crystal Glass (Prism Clear) – homecabinets crystal-glass-shaker
cg = shopify_images("crystal-glass-shaker")
print("crystal glass imgs:", cg[:4])
if cg:
    print("Prism room:", save(cg[0], "prism-clear-room.jpg", "homecabinets.com", 300, 250))

# Aston Green (Virid Echo)
ag = shopify_images("aston-green-shaker-cabinets")
print("aston green imgs:", ag[:4])
if ag:
    print("Virid room:", save(ag[0], "virid-echo-room.jpg", "homecabinets.com", 300, 250))
    if len(ag) > 1:
        print("Virid door:", save(ag[1], "virid-echo-door.jpg", "homecabinets.com"))

# Casselberry Saddle – turbify with kabinetking referer
host = "www.kabinetking.com"
print("Cassel room:", save("https://s.turbifycdn.com/aah/yhst-23195497405989/casselberry-saddle-kitchen-cabinets-118.jpg",
                           "casselberry-saddle-room.jpg", host, 300, 250))
print("Cassel door:", save("https://s.turbifycdn.com/aah/yhst-23195497405989/casselberry-saddle-sample-door-5.jpg",
                           "casselberry-saddle-door.jpg", host))
