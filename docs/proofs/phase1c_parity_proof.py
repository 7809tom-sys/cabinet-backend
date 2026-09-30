"""Phase 1 one-engine browser proof (extended).

Seeds Designer drafts for a standard 144x120 room and a Wall Builder room whose
first drawn wall is the same 144" run, then in the real Floor Plan performs the
same gestures on B12, B36 and W3030 in each room and records
wallId / wallOffset / rotation / x / y / width after every step:

  start, drag_toward_anchor, nudge_right_3in, drag_past_run_end, drag_back_to_60,
  rotate_90, rotate_180, depth_move_in_1, snap_to_wall_button, width_resize,
  catalog_drop (a NEW cabinet of the same code dropped from the palette).

A third pair of scenarios ("legacy") seeds the SAME cabinets saved the pre-Phase-1
way (no wallId / wallOffset at all) and records what the Designer restores them
as, then nudges once — proving the one-time back-fill puts them on the shared path.

Usage: python3 /tmp/phase1c_parity_proof.py [BASE_URL]
"""
from playwright.sync_api import sync_playwright
from pathlib import Path
import json, re, sys, time

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:3000"
fixture = json.loads(Path("/tmp/phase1-fixture.json").read_text())
ACTIVE = "cabinet-dealz:designer-draft:active:v2:owner"
OUT = {}
RESIZE_TO = {"B12": 15, "B36": 33, "W3030": 27}
# Non-colliding palette-drop centres (inches along the run) for the END layout:
# anchor B24 0-24, B36 60.125-93.125 (w33), B12 100.125-115.125 (w15),
# W3030 (wall layer) 60.125-87.125 (w27).
DROP_CENTER = {"B36": 42, "B12": 125, "W3030": 105}
UIDS = {"B12": "p-b12", "B36": "p-b36", "W3030": "p-w3030"}


def draft_for(scenario, legacy=False):
    placed = scenario["placed"]
    if legacy:
        placed = [{k: v for k, v in p.items() if k not in ("wallId", "wallOffset")} for p in placed]
    return {
        "v": 2, "savedAt": int(time.time() * 1000), "originScope": "owner",
        "room": scenario["room"], "placed": placed, "openings": [], "island": None,
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


FIELDS = ("wallId", "wallOffset", "rotation", "x", "y", "width", "depth", "height", "masterCode")


def _saved(page, key):
    return page.evaluate("key => JSON.parse(localStorage.getItem(key))", key)


def _read_line(page, key, uid):
    saved = _saved(page, key)
    line = next(item for item in saved["placed"] if item["uid"] == uid)
    return {k: line.get(k) for k in FIELDS}


def saved_line(page, key, uid):
    """The draft is written on a debounce; wait until two reads 500ms apart agree."""
    prev = _read_line(page, key, uid)
    for _ in range(6):
        page.wait_for_timeout(500)
        cur = _read_line(page, key, uid)
        if cur == prev:
            return cur
        prev = cur
    return prev


def new_line(page, key, known_uids, code):
    """Wait for a NEW placed record with masterCode == code (palette drop)."""
    for _ in range(12):
        page.wait_for_timeout(500)
        saved = _saved(page, key)
        fresh = [p for p in saved["placed"] if p["uid"] not in known_uids and str(p.get("masterCode", "")).replace("-", "") == code]
        if fresh:
            line = fresh[0]
            return line["uid"], {k: line.get(k) for k in FIELDS}
    return None, None


class PosEl:
    """Locate a plan cabinet by its saved plan position (title text is context-dependent)."""
    def __init__(self, page, key, uid, room_box, ppi):
        self.page, self.key, self.uid, self.room_box, self.ppi = page, key, uid, room_box, ppi

    def wait_for(self, **_):
        return None

    def bounding_box(self):
        line = saved_line(self.page, self.key, self.uid)
        w, d = line["width"], line["depth"]
        if line["rotation"] in (90, 270):
            w, d = d, w
        return {"x": self.room_box["x"] + line["x"] * self.ppi, "y": self.room_box["y"] + line["y"] * self.ppi, "width": w * self.ppi, "height": d * self.ppi}


CTX = {}


def plan_el(page, code):
    return PosEl(page, CTX["key"], UIDS[code], CTX["room_box"], CTX["ppi"])


def open_designer(p, name, scenario, legacy=False):
    email = f"phase1c.{name}.proof@cabinetdealz.test"
    key = f"cabinet-dealz:designer-draft:v2:owner:{email}"
    browser = p.chromium.launch(headless=True, executable_path="/usr/bin/chromium", args=["--no-sandbox"])
    context = browser.new_context(viewport={"width": 1440, "height": 1000})
    page = context.new_page()
    page.goto(BASE, wait_until="load")
    page.evaluate("([active,key,draft])=>{localStorage.setItem(active,key);localStorage.setItem(key,JSON.stringify(draft));}", [ACTIVE, key, draft_for(scenario, legacy)])
    page.goto(f"{BASE}/design?phase1c={name}", wait_until="load")
    page.wait_for_timeout(2500)
    page.locator('input[type="email"]').fill(email)
    page.get_by_text("Launch Designer", exact=True).click(timeout=30000)
    try:
        page.get_by_test_id("beginner-first-cabinet-guide").get_by_text("I’ll explore first", exact=True).click(timeout=2500, force=True)
    except Exception:
        pass
    page.wait_for_timeout(2000)
    page.get_by_test_id("switch-to-floor-plan").evaluate("el => el.click()")
    page.wait_for_timeout(1200)
    room_box = page.locator("[data-room]").first.bounding_box()
    ppi = room_box["width"] / scenario["room"]["width"]
    CTX.update({"key": key, "room_box": room_box, "ppi": ppi})
    return browser, page, key, ppi


def refresh(page):
    rb = page.locator("[data-room]").first.bounding_box()
    CTX["room_box"] = rb
    return rb


def center_of(el):
    box = el.bounding_box()
    return box, box["x"] + box["width"] / 2, box["y"] + box["height"] / 2


def close_dialogs(page):
    page.keyboard.press("Escape")
    page.wait_for_timeout(400)
    try:
        page.locator('[role="dialog"]').first.wait_for(state="hidden", timeout=4000)
    except Exception:
        page.keyboard.press("Escape")
        page.wait_for_timeout(800)


def run_scenario(p, name, scenario, is_drawn):
    browser, page, key, ppi = open_designer(p, name, scenario)
    results = {"_ppi": ppi}
    for code in ("B12", "B36", "W3030"):
        assert page.locator(f'[data-room] div[title*="{code}"]').count() >= 1, f"{code} not rendered"
    for code in ("W3030", "B12", "B36"):
        uid = UIDS[code]
        room_box = refresh(page)
        el = plan_el(page, code)
        rec = {"start": saved_line(page, key, uid)}
        width = rec["start"]["width"]
        # 1. drag: put the cabinet's left edge 2.3" past the anchor (x=24) → magnet → 24
        box, grab_x, grab_y = center_of(el)
        dx = room_box["x"] + (24 + 2.3) * ppi - box["x"]
        for attempt in range(2):
            page.mouse.move(grab_x, grab_y); page.mouse.down()
            page.mouse.move(grab_x + dx / 2, grab_y, steps=6)
            page.mouse.move(grab_x + dx, grab_y, steps=6)
            page.mouse.up(); page.wait_for_timeout(900)
            rec["drag_toward_anchor"] = saved_line(page, key, uid)
            if rec["drag_toward_anchor"] != rec["start"]:
                break
            room_box = refresh(page); box, grab_x, grab_y = center_of(plan_el(page, code))
        # 2. nudge: ArrowRight x3 (1" each)
        for _ in range(3):
            page.keyboard.press("ArrowRight"); page.wait_for_timeout(250)
        page.wait_for_timeout(700)
        rec["nudge_right_3in"] = saved_line(page, key, uid)
        # 3. run-end clamp
        room_box = refresh(page); box, grab_x, grab_y = center_of(plan_el(page, code))
        far = room_box["x"] + room_box["width"] + 40
        page.mouse.move(grab_x, grab_y); page.mouse.down()
        page.mouse.move(far, grab_y, steps=10); page.mouse.up(); page.wait_for_timeout(900)
        rec["drag_past_run_end"] = saved_line(page, key, uid)
        # 4. exact 1/8" spot
        room_box = refresh(page); box, grab_x, grab_y = center_of(plan_el(page, code))
        top_y = room_box["y"] + (rec["start"]["depth"] / 2) * ppi
        park = 100.125 if code == "B12" else 60.125
        mid = room_box["x"] + (park + width / 2) * ppi
        page.mouse.move(grab_x, grab_y); page.mouse.down()
        page.mouse.move((grab_x + mid) / 2, (grab_y + top_y) / 2, steps=6)
        page.mouse.move(mid, top_y, steps=6); page.mouse.up(); page.wait_for_timeout(900)
        rec["drag_back_to_60"] = saved_line(page, key, uid)
        # 5. rotate twice (R = +90 each)
        room_box = refresh(page); box, gx, gy = center_of(plan_el(page, code))
        page.mouse.click(gx, gy); page.wait_for_timeout(300)
        page.keyboard.press("r"); page.wait_for_timeout(400)
        rec["rotate_90"] = saved_line(page, key, uid)
        page.keyboard.press("r"); page.wait_for_timeout(600)
        rec["rotate_180"] = saved_line(page, key, uid)
        # 6. depth move in 1" via attributes dialog
        room_box = refresh(page); box, gx, gy = center_of(plan_el(page, code))
        page.mouse.dblclick(gx, gy); page.wait_for_timeout(900)
        btn = page.locator('[data-testid="cabinet-depth-move-controls"] button[title^="Move in"]').first
        btn.wait_for(state="attached", timeout=8000)
        btn.evaluate("el => { el.scrollIntoView({block:'center'}); el.click(); }")
        page.wait_for_timeout(700)
        rec["depth_move_in_1"] = saved_line(page, key, uid)
        close_dialogs(page)
        page.wait_for_timeout(500)
        # 7. Snap-to-wall button. The WallPicker renders in the selection sheet
        #    of the compact (<1024px) workspace, so switch to a tablet viewport,
        #    select the cabinet, press the run's snap button, then switch back.
        page.keyboard.press("Escape"); page.wait_for_timeout(300)
        page.set_viewport_size({"width": 1000, "height": 1000}); page.wait_for_timeout(1200)
        room_box = refresh(page)
        # click an empty floor spot to clear any selection, then select the cabinet
        page.mouse.click(room_box["x"] + room_box["width"] * 0.5, room_box["y"] + room_box["height"] * 0.8); page.wait_for_timeout(500)
        room_box = refresh(page); box, gx, gy = center_of(plan_el(page, code))
        page.mouse.click(gx, gy); page.wait_for_timeout(1200)
        if is_drawn:
            snap_btn = page.locator('button[title^="Snap this cabinet to "]').first
        else:
            snap_btn = page.locator('button[title="Snap to back wall"]').first
        snap_btn.wait_for(state="attached", timeout=10000)
        rec["snap_button_title"] = snap_btn.get_attribute("title")
        snap_btn.evaluate("el => { el.scrollIntoView({block:'center'}); el.click(); }")
        page.wait_for_timeout(900)
        rec["snap_to_wall_button"] = saved_line(page, key, uid)
        close_dialogs(page)
        page.set_viewport_size({"width": 1440, "height": 1000}); page.wait_for_timeout(900)
        # 8. width resize via the Attributes dialog (double-click the cabinet)
        room_box = refresh(page); box, gx, gy = center_of(plan_el(page, code))
        page.mouse.dblclick(gx, gy); page.wait_for_timeout(900)
        w_input = page.locator('[role="dialog"] input[aria-label="Width in inches"]').first
        w_input.wait_for(state="attached", timeout=8000)
        w_input.evaluate("el => el.scrollIntoView({block:'center'})")
        w_input.fill(str(RESIZE_TO[code])); page.wait_for_timeout(900)
        rec["width_resize"] = saved_line(page, key, uid)
        close_dialogs(page)
        page.wait_for_timeout(500)
        results[code] = rec
    # 9. palette drops of a NEW cabinet of each code into a known-free spot
    known = {p["uid"] for p in _saved(page, key)["placed"]}
    for code in ("B36", "B12", "W3030"):
        room_box = refresh(page)
        tab = "wall" if code == "W3030" else "base"
        page.locator("button", has_text=re.compile(rf"^{tab}$", re.I)).first.click()
        page.wait_for_timeout(400)
        search = page.locator('input[placeholder^="Search by name"]').first
        search.fill(code); page.wait_for_timeout(900)
        disp = f"{code[0]}-{code[1:]}"
        sel = f'button[draggable]:has(div.font-mono:text-is("{code}")), button[draggable]:has(div.font-mono:text-is("{disp}"))'
        source = page.locator(sel).first
        source.wait_for(state="visible", timeout=10000)
        source.scroll_into_view_if_needed()
        depth = 12 if code == "W3030" else 24
        target_pos = {"x": DROP_CENTER[code] * ppi, "y": (depth / 2) * ppi}
        page.drag_and_drop(sel, "[data-room]", target_position=target_pos, steps=12)
        page.wait_for_timeout(900)
        uid, line = new_line(page, key, known, code)
        results[code]["catalog_drop_target_center_in"] = DROP_CENTER[code]
        results[code]["catalog_drop"] = line
        if uid:
            known.add(uid)
        search.fill(""); page.wait_for_timeout(300)
    page.screenshot(path=f"/tmp/phase1c-{name}-floorplan.png", full_page=False)
    browser.close()
    return results


def run_legacy(p, name, scenario):
    """Load the same cabinets saved WITHOUT wallId/wallOffset (pre-Phase-1) and read what restores."""
    browser, page, key, ppi = open_designer(p, name, scenario, legacy=True)
    results = {}
    for code in ("W3030", "B12", "B36"):
        uid = UIDS[code]
        rec = {"restored": saved_line(page, key, uid)}
        room_box = refresh(page); box, gx, gy = center_of(plan_el(page, code))
        page.mouse.click(gx, gy); page.wait_for_timeout(300)
        page.keyboard.press("ArrowRight"); page.wait_for_timeout(700)
        rec["nudge_right_1in"] = saved_line(page, key, uid)
        results[code] = rec
    page.screenshot(path=f"/tmp/phase1c-{name}-floorplan.png", full_page=False)
    browser.close()
    return results


with sync_playwright() as p:
    OUT["standard"] = run_scenario(p, "standard", fixture["standard"], False)
    OUT["drawn"] = run_scenario(p, "drawn", fixture["drawn"], True)
    OUT["legacy_standard"] = run_legacy(p, "legacy-standard", fixture["standard"])
    OUT["legacy_drawn"] = run_legacy(p, "legacy-drawn", fixture["drawn"])
Path("/tmp/phase1c-proof-results.json").write_text(json.dumps(OUT, indent=2))


def same(s, d):
    if s is None or d is None:
        return False
    offs = (s["wallOffset"] == d["wallOffset"]) or (s["wallOffset"] is not None and d["wallOffset"] is not None and abs(s["wallOffset"] - d["wallOffset"]) <= 1e-6)
    return offs and abs(s["x"] - d["x"]) <= 1e-6 and abs(s["y"] - d["y"]) <= 1e-6 and s["rotation"] == d["rotation"] and s["width"] == d["width"]


def fmt(l):
    return "—" if l is None else f"{l['wallId']} / {l['wallOffset']} | {l['x']},{l['y']} r{l['rotation']} w{l['width']}"


STEPS = ("start", "drag_toward_anchor", "nudge_right_3in", "drag_past_run_end", "drag_back_to_60", "rotate_90", "rotate_180",
         "depth_move_in_1", "snap_to_wall_button", "width_resize", "catalog_drop")
rows, mismatch = [], 0
for code in ("W3030", "B12", "B36"):
    for step in STEPS:
        s = OUT["standard"][code].get(step); d = OUT["drawn"][code].get(step)
        ok = same(s, d)
        mismatch += 0 if ok else 1
        rows.append(f"| {code} | {step} | {fmt(s)} | {fmt(d)} | {'match' if ok else 'DIFF'} |")
print("## Gesture parity (standard room vs Wall Builder room)")
print("| cabinet | step | standard wallId / offset, x,y rot width | wall-builder wallId / offset, x,y rot width | result |")
print("|---|---|---|---|---|")
print("\n".join(rows))
print(f"\nMISMATCHES {mismatch}")
print(f"\nSnap button titles: standard={OUT['standard']['B36'].get('snap_button_title')} drawn={OUT['drawn']['B36'].get('snap_button_title')}")

print("\n## Legacy (pre-Phase-1, saved without wallId/wallOffset) restore + nudge")
print("| room | cabinet | seeded as | restored wallId / offset | after nudge +1 | matches metadata-carrying room? |")
print("|---|---|---|---|---|---|")
legacy_mismatch = 0
for room, ref in (("legacy_standard", "standard"), ("legacy_drawn", "drawn")):
    for code in ("W3030", "B12", "B36"):
        r = OUT[room][code]["restored"]; n = OUT[room][code]["nudge_right_1in"]
        ref_start = OUT[ref][code]["start"]
        ok = r["wallId"] == ref_start["wallId"] and r["wallOffset"] == ref_start["wallOffset"] and r["x"] == ref_start["x"] and r["y"] == ref_start["y"] \
            and n["wallId"] == ref_start["wallId"] and abs((n["wallOffset"] or -99) - (ref_start["wallOffset"] + 1)) <= 1e-6
        legacy_mismatch += 0 if ok else 1
        print(f"| {room} | {code} | no wallId, no wallOffset, x={ref_start['x']},y={ref_start['y']} | {r['wallId']} / {r['wallOffset']} | {n['wallId']} / {n['wallOffset']} | {'yes' if ok else 'NO'} |")
print(f"\nLEGACY_MISMATCHES {legacy_mismatch}")
