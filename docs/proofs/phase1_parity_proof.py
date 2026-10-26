"""Phase 1 one-engine browser proof.

Seeds two Designer drafts (a standard 144x120 room and a Wall Builder room whose
first drawn wall is the same 144" run), then in the real Floor Plan performs the
same gestures on B12, B36 and W3030 in each room:
  1. drag  – pull the cabinet ~2.3" past the B24 anchor's right end (magnet on)
  2. nudge – ArrowRight x3 (1" each) with the cabinet selected
  3. snap  – drag to far end so the run-end clamp applies
and records wallId / wallOffset / rotation / x / y after each step.
Usage: python3 /tmp/phase1_parity_proof.py [BASE_URL]
"""
from playwright.sync_api import sync_playwright
from pathlib import Path
import json, sys, time

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:3000"
fixture = json.loads(Path("/tmp/phase1-fixture.json").read_text())
ACTIVE = "cabinet-dealz:designer-draft:active:v2:owner"
OUT = {}


def draft_for(scenario):
    return {
        "v": 2, "savedAt": int(time.time() * 1000), "originScope": "owner",
        "room": scenario["room"], "placed": scenario["placed"], "openings": [], "island": None,
        "styleId": 330028, "styleB": None, "activeSlot": "A", "tier": "retail",
        "crown": False, "toeKick": False, "batten": False, "lightRail": False, "valance": False,
        "trimManualOverride": {}, "trimQtyOverride": {}, "countertop": True,
        "countertopMaterialId": "white-quartz", "edgeProfileId": "eased", "backsplashMaterialId": None,
        "backsplashHeightMode": "standard", "countertopBacksplashHeightIn": 0, "flooringMaterialId": None,
        "flooringPattern": "straight", "selectedSurfaces": [], "cabinetsLocked": False, "sinks": [],
        "potFillers": [], "roomType": "kitchen", "activeWall": scenario["wall"], "layoutLocked": False,
        "lockedWalls": [], "lockedDistributorId": None, "mixedWarehouseOverride": False,
        "hardwareStyleId": None, "wallCabHeight": 42, "annotations": [], "ponyWalls": [],
    }


def saved_line(page, key, uid):
    saved = page.evaluate("key => JSON.parse(localStorage.getItem(key))", key)
    line = next(item for item in saved["placed"] if item["uid"] == uid)
    return {k: line.get(k) for k in ("wallId", "wallOffset", "rotation", "x", "y", "width", "depth", "height", "masterCode")}


class PosEl:
    """Locate a plan cabinet by its saved plan position (title text is context-dependent)."""
    def __init__(self, page, key, uid, room_box, ppi, code):
        self.page, self.key, self.uid, self.room_box, self.ppi, self.code = page, key, uid, room_box, ppi, code
    def wait_for(self, **_):
        return None
    def bounding_box(self):
        line = saved_line(self.page, self.key, self.uid)
        w, d = line["width"], line["depth"]
        if line["rotation"] in (90, 270):
            w, d = d, w
        return {"x": self.room_box["x"] + line["x"] * self.ppi, "y": self.room_box["y"] + line["y"] * self.ppi, "width": w * self.ppi, "height": d * self.ppi}


def plan_el(page, code):
    return PosEl(page, CTX["key"], CTX["uids"][code], CTX["room_box"], CTX["ppi"], code)


CTX = {}


def run_scenario(p, name, scenario):
    email = f"phase1.{name}.proof@cabinetdealz.test"
    key = f"cabinet-dealz:designer-draft:v2:owner:{email}"
    browser = p.chromium.launch(headless=True, executable_path="/usr/bin/chromium", args=["--no-sandbox"])
    context = browser.new_context(viewport={"width": 1440, "height": 1000})
    page = context.new_page()
    page.goto(BASE, wait_until="networkidle")
    page.evaluate("([active,key,draft])=>{localStorage.setItem(active,key);localStorage.setItem(key,JSON.stringify(draft));}", [ACTIVE, key, draft_for(scenario)])
    page.goto(f"{BASE}/design?phase1={name}", wait_until="networkidle")
    page.locator('input[type="email"]').fill(email)
    page.get_by_text("Launch Designer", exact=True).click(timeout=30000)
    try:
        page.get_by_test_id("beginner-first-cabinet-guide").get_by_text("I’ll explore first", exact=True).click(timeout=2500, force=True)
    except Exception:
        pass
    page.wait_for_timeout(2000)
    page.get_by_test_id("switch-to-floor-plan").evaluate("el => el.click()")
    page.wait_for_timeout(1200)
    results = {}
    room_el = page.locator("[data-room]").first
    room_box = room_el.bounding_box()
    ppi = room_box["width"] / scenario["room"]["width"]
    results["_ppi"] = ppi
    CTX.update({"key": key, "room_box": room_box, "ppi": ppi, "uids": {"B12": "p-b12", "B36": "p-b36", "W3030": "p-w3030"}})
    # Verify the plan actually renders the seeded cabinets (title contains code).
    for code in ("B12", "B36", "W3030"):
        assert page.locator(f'[data-room] div[title*="{code}"]').count() >= 1, f"{code} not rendered"
    def refresh():
        rb = page.locator("[data-room]").first.bounding_box()
        CTX["room_box"] = rb
        return rb
    for code, uid in (("W3030", "p-w3030"), ("B12", "p-b12"), ("B36", "p-b36")):
        room_box = refresh()
        el = plan_el(page, code)
        el.wait_for(state="visible", timeout=20000)
        rec = {"start": saved_line(page, key, uid)}
        width = rec["start"]["width"]
        # 1. drag: put the cabinet's left edge 2.3" past the anchor (x=24) → magnet → 24
        box = el.bounding_box()
        grab_x, grab_y = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
        target_left_px = room_box["x"] + (24 + 2.3) * ppi
        dx = target_left_px - box["x"]
        hit = page.evaluate("([x,y]) => { const el = document.elementFromPoint(x,y); return el ? (el.getAttribute('title')||el.closest('[title]')?.getAttribute('title')||el.className.toString().slice(0,60)) : null }", [grab_x, grab_y])
        rec["grab_hit"] = hit
        page.mouse.move(grab_x, grab_y); page.mouse.down()
        page.mouse.move(grab_x + dx / 2, grab_y, steps=6)
        page.mouse.move(grab_x + dx, grab_y, steps=6)
        page.mouse.up(); page.wait_for_timeout(900)
        rec["drag_toward_anchor"] = saved_line(page, key, uid)
        # 2. nudge: cabinet is selected after drag → ArrowRight x3
        for _ in range(3):
            page.keyboard.press("ArrowRight"); page.wait_for_timeout(250)
        page.wait_for_timeout(700)
        rec["nudge_right_3in"] = saved_line(page, key, uid)
        # 3. run-end clamp: drag far right past the wall end
        room_box = refresh(); el = plan_el(page, code); box = el.bounding_box()
        grab_x, grab_y = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
        far = room_box["x"] + room_box["width"] + 40
        page.mouse.move(grab_x, grab_y); page.mouse.down()
        page.mouse.move(far, grab_y, steps=10); page.mouse.up(); page.wait_for_timeout(900)
        rec["drag_past_run_end"] = saved_line(page, key, uid)
        # 4. drag back to an exact 1/8" spot at 60" along the top wall (magnet off
        #    would keep 60.125; with magnet on and nothing within reach it stays exact)
        room_box = refresh(); el = plan_el(page, code); box = el.bounding_box()
        grab_x, grab_y = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
        top_y = room_box["y"] + (rec["start"]["depth"] / 2) * ppi
        park = 100.125 if code == "B12" else 60.125
        mid = room_box["x"] + (park + width / 2) * ppi
        page.mouse.move(grab_x, grab_y); page.mouse.down()
        page.mouse.move((grab_x + mid) / 2, (grab_y + top_y) / 2, steps=6)
        page.mouse.move(mid, top_y, steps=6); page.mouse.up(); page.wait_for_timeout(900)
        rec["drag_back_to_60"] = saved_line(page, key, uid)
        results[code] = rec
    page.screenshot(path=f"/tmp/phase1-{name}-floorplan.png", full_page=False)
    browser.close()
    return results


with sync_playwright() as p:
    for name in ("standard", "drawn"):
        OUT[name] = run_scenario(p, name, fixture[name])

Path("/tmp/phase1-proof-results.json").write_text(json.dumps(OUT, indent=2))
rows = []
mismatch = 0
for code in ("W3030", "B12", "B36"):
    for step in ("start", "drag_toward_anchor", "nudge_right_3in", "drag_past_run_end", "drag_back_to_60"):
        s = OUT["standard"][code][step]; d = OUT["drawn"][code][step]
        same = (s["wallOffset"] is not None and d["wallOffset"] is not None and abs(s["wallOffset"] - d["wallOffset"]) <= 1e-6 and abs(s["x"] - d["x"]) <= 1e-6 and abs(s["y"] - d["y"]) <= 1e-6 and s["rotation"] == d["rotation"])
        mismatch += 0 if same else 1
        rows.append(f"| {code} | {step} | {s['wallId']} / {s['wallOffset']} | {d['wallId']} / {d['wallOffset']} | {s['x']},{s['y']} r{s['rotation']} | {d['x']},{d['y']} r{d['rotation']} | {'match' if same else 'DIFF'} |")
print("| cabinet | step | standard wallId/offset | wall-builder wallId/offset | standard x,y rot | wall-builder x,y rot | result |")
print("|---|---|---|---|---|---|---|")
print("\n".join(rows))
print("ppi", OUT["standard"]["_ppi"], OUT["drawn"]["_ppi"])
for name in ("standard","drawn"):
    print(name, "grab hits:", {c: OUT[name][c]["grab_hit"] for c in ("B12","B36","W3030")})
print("MISMATCHES", mismatch)
sys.exit(1 if mismatch else 0)
