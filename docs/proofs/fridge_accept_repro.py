import json, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:3000"
STYLE = 330028
NORMAL_ROOM = {"width": 144, "depth": 120, "ceilingHeight": 96}
CUSTOM_ROOM = json.loads(Path("/tmp/continuous-room.json").read_text()) | {"ceilingHeight": 96}


def fridge(room, continuous):
    payload = {
        "uid": "fridge", "cabinetId": 0, "masterCode": "FRIDGE-36", "description": 'Refrigerator 36"',
        "placement": "appliance", "x": 30, "y": 0, "width": 36, "depth": 30, "height": 70, "rotation": 0, "styleId": STYLE,
    }
    if continuous:
        payload |= {"wallId": room["customWalls"][0]["id"], "wallOffset": 30}
    return [payload]


def draft(room, placed):
    return {
        "v": 2, "savedAt": int(time.time() * 1000), "originScope": "owner", "styleId": STYLE, "styleB": None,
        "room": room, "placed": placed, "activeWall": room.get("customWalls", [{}])[0].get("id", "top"), "activeSlot": "A", "roomType": "kitchen",
        "wallCabHeight": 30, "countertop": True, "countertopMaterialId": "white-quartz", "backsplashHeightMode": "standard",
        "backsplashHeightIn": 0, "countertopBacksplashHeightIn": 0, "edgeProfileId": "eased", "openings": [], "ponyWalls": [],
        "potFillers": [], "annotations": [], "selectedSurfaces": [], "sinks": [], "island": None, "crown": False,
        "toeKick": False, "lightRail": False, "valance": False, "batten": False, "layoutLocked": False, "cabinetsLocked": False,
        "lockedWalls": [], "mixedWarehouseOverride": False, "trimManualOverride": {"batten": False, "crown": False, "lightRail": False, "toeKick": False, "valance": False}, "trimQtyOverride": {},
    }


def scenario(page, label, room, continuous, errors):
    email = f"fridgeaccept.{label}@cabinetdealz.test"
    key = f"cabinet-dealz:designer-draft:v2:owner:{email}"
    active = "cabinet-dealz:designer-draft:active:v2:owner"
    data = draft(room, fridge(room, continuous))
    page.goto(BASE, wait_until="networkidle")
    page.evaluate("([active,key,draft])=>{localStorage.setItem(active,key);localStorage.setItem(key,JSON.stringify(draft));}", [active, key, data])
    page.goto(f"{BASE}/design?fridgeaccept={label}&v={int(time.time())}", wait_until="networkidle")
    page.locator('input[type="email"]').fill(email)
    page.get_by_text("Launch Designer", exact=True).click(timeout=30000)
    try:
        page.get_by_test_id("beginner-first-cabinet-guide").get_by_text("I’ll explore first", exact=True).click(timeout=2500, force=True)
    except Exception:
        pass
    page.wait_for_timeout(15000)
    # Close any dialog that opened automatically
    for _ in range(2):
        if page.locator('[role="dialog"]').count():
            page.keyboard.press("Escape"); page.wait_for_timeout(500)
    page.get_by_text("Floor Plan", exact=True).first.click()
    page.wait_for_timeout(1200)

    def read_state():
        return page.evaluate("(key)=>{const d=JSON.parse(localStorage.getItem(key)||'{}');return (d.placed||[]).map(p=>({code:p.masterCode,role:p.refrigeratorAssemblyRole||null,wallId:p.wallId||null,off:p.wallOffset??null,x:p.x,y:p.y}));}", key)

    before = read_state()
    # Open the refrigerator popup by selecting the fridge in the plan
    opened = False
    plan = page.locator('[data-testid="plan-canvas"], svg').first
    box = plan.bounding_box()
    # Try clicking on the fridge label text
    try:
        page.get_by_text("FRIDGE-36", exact=False).first.click(timeout=4000)
        opened = page.locator('[data-testid="refrigerator-enclosure-options"]').count() > 0
    except Exception:
        pass
    if not opened:
        # Fallback: scan a grid of clicks on the plan canvas
        for fx in (0.15, 0.25, 0.35, 0.45, 0.55):
            for fy in (0.12, 0.2, 0.3):
                page.mouse.click(box["x"] + box["width"] * fx, box["y"] + box["height"] * fy)
                page.wait_for_timeout(400)
                if page.locator('[data-testid="refrigerator-enclosure-options"]').count():
                    opened = True; break
            if opened: break
    page.wait_for_timeout(800)
    dialog_text = page.locator('[role="dialog"]').first.inner_text() if page.locator('[role="dialog"]').count() else ""
    if not opened:
        page.screenshot(path=f"/tmp/fridge-accept-{label}-noopen.png")
        return {"label": label, "opened": False, "before": before, "dialog": dialog_text[:300]}
    # Expand the enclosure options and choose Both panels; then Accept
    page.evaluate("()=>{document.querySelectorAll('details').forEach(d=>d.open=true)}")
    page.wait_for_timeout(300)
    loc = page.locator('[role="dialog"]').get_by_role("button", name="Both", exact=True)
    if loc.count():
        loc.first.click(force=True)
    page.wait_for_timeout(300)
    page.screenshot(path=f"/tmp/fridge-accept-{label}-dialog.png")
    accept = page.locator('[role="dialog"]').get_by_role("button", name="Add to plan")
    disabled = accept.is_disabled() if accept.count() else None
    title = accept.get_attribute("title") if accept.count() else None
    if accept.count():
        accept.click()
    page.wait_for_timeout(2500)
    toasts = page.locator('[data-sonner-toast], [role="status"]').all_inner_texts()
    still_open = page.locator('[data-testid="refrigerator-enclosure-options"]').count() > 0
    after = read_state()
    page.screenshot(path=f"/tmp/fridge-accept-{label}-after.png")
    return {
        "label": label, "opened": True, "acceptDisabled": disabled, "acceptTitle": title,
        "dialogStillOpen": still_open, "toasts": toasts,
        "beforeCount": len(before), "afterCount": len(after), "after": after,
        "consoleErrors": errors[:6],
    }


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path="/usr/bin/chromium", args=["--no-sandbox"])
    ctx = browser.new_context(viewport={"width": 1440, "height": 1000})
    page = ctx.new_page()
    errors = []
    page.on("console", lambda m: errors.append(m.text[:300]) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append("PAGEERROR " + str(e)[:300]))
    out = [scenario(page, "standard", NORMAL_ROOM, False, errors)]
    errors.clear()
    out.append(scenario(page, "continuous", CUSTOM_ROOM, True, errors))
    print(json.dumps(out, indent=2))
    browser.close()
