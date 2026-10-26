import json
import os
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://127.0.0.1:3000").rstrip("/")
TAG = os.environ.get("TAG", "local")
OUT = Path("/tmp")
EMAIL = "missing-price-proof@cabinetdealz.test"
DRAFT_KEY = f"cabinet-dealz:designer-draft:v2:owner:{EMAIL}"
ACTIVE_KEY = "cabinet-dealz:designer-draft:active:v2:owner"
MADISON_SHAKER_WHITE = 330014  # Madison line (dist 210002) prices BER36, not ERB36
MADISON_ID = 210002

ROOM = {"width": 144, "depth": 120, "ceilingHeight": 96}


def draft():
    return {
        "v": 2, "originScope": "owner", "savedAt": int(time.time() * 1000),
        "room": ROOM,
        "placed": [
            {"uid": "erb36-corner", "cabinetId": 9360042, "masterCode": "ERB36",
             "description": "36\" Easy Reach Base Cabinet with Lazy Susan", "placement": "base",
             "x": 108, "y": 0, "width": 36, "depth": 24, "height": 34.5, "rotation": 0,
             "wallId": "top", "wallOffset": 108, "cornerType": "lazy-susan", "isCornerCabinet": True,
             "numberOfDoors": 2, "numberOfDrawers": 0},
            {"uid": "b48-missing", "cabinetId": 9390013, "masterCode": "B48",
             "description": "48\" Double Door Two Drawer Base Cabinet", "placement": "base",
             "x": 30, "y": 0, "width": 48, "depth": 24, "height": 34.5, "rotation": 0,
             "wallId": "top", "wallOffset": 30, "numberOfDoors": 2, "numberOfDrawers": 2},
        ],
        "openings": [], "island": None,
        "styleId": MADISON_SHAKER_WHITE, "styleA": MADISON_SHAKER_WHITE, "lockedDistributorId": MADISON_ID,
        "tier": "homeowner", "activeWall": "top",
        "layoutLocked": False, "lockedWalls": [], "cabinetsLocked": False,
        "sinks": [], "potFillers": [], "roomType": "kitchen", "annotations": [], "ponyWalls": [],
    }


def close_dialogs(page):
    for _ in range(3):
        if page.locator('[role="dialog"]').count():
            page.keyboard.press("Escape")
            page.wait_for_timeout(200)


with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, executable_path="/usr/bin/chromium", args=["--no-sandbox"])
    context = browser.new_context(viewport={"width": 1600, "height": 1050}, device_scale_factor=1)
    page = context.new_page()
    errors = []
    page.on("console", lambda m: errors.append(f"{m.type}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    api_log = []
    page.on("response", lambda r: api_log.append(r.url) if "designMissingPrice.logMissing" in r.url else None)
    d = draft()
    page.add_init_script(script=(
        f"localStorage.setItem({json.dumps(DRAFT_KEY)}, JSON.stringify({json.dumps(d)}));"
        f"localStorage.setItem({json.dumps(ACTIVE_KEY)}, {json.dumps(DRAFT_KEY)});"))
    page.goto(f"{BASE}/design?missing-price-proof={int(time.time())}", wait_until="networkidle", timeout=60000)
    bundle = page.evaluate("Array.from(document.scripts).map(s => s.src).filter(Boolean)")
    page.locator('input[type="email"]').fill(EMAIL)
    page.get_by_text("Launch Designer", exact=True).click(timeout=30000)
    try:
        page.get_by_test_id("beginner-first-cabinet-guide").get_by_text("I’ll explore first", exact=True).click(timeout=2500, force=True)
    except Exception:
        pass
    close_dialogs(page)
    page.get_by_test_id("switch-to-floor-plan").click(timeout=15000)
    page.wait_for_timeout(2500)

    # Make sure the Madison style is actually active (draft restore may need the picker).
    body = page.locator("body").inner_text()
    flagged = page.locator('[data-price-missing="true"]')
    page.wait_for_timeout(1500)
    flagged_titles = [flagged.nth(i).get_attribute("title") or "" for i in range(flagged.count())]
    banner = page.get_by_test_id("missing-price-banner")
    banner_text = banner.first.inner_text() if banner.count() else None
    indicator_count = page.get_by_test_id("price-missing-indicator").count()
    page.screenshot(path=str(OUT / f"missing-price-{TAG}-floor-plan.png"), full_page=False)

    # Side panel / list price text for ERB36 and B48.
    panel_text = body
    erb_line = [ln for ln in panel_text.splitlines() if "ERB36" in ln or "BER36" in ln][:6]
    b48_line = [ln for ln in panel_text.splitlines() if "B48" in ln][:6]

    # Materials list dialog
    materials_banner = None
    materials_flags = []
    cart_blocked = None
    try:
        page.get_by_role("button", name="Materials & Parts", exact=False).first.click(timeout=8000)
        page.wait_for_timeout(1200)
        mb = page.get_by_test_id("materials-missing-price-banner")
        materials_banner = mb.inner_text() if mb.count() else None
        mf = page.get_by_test_id("materials-price-missing-flag")
        materials_flags = [mf.nth(i).inner_text() for i in range(mf.count())]
        blocked = page.locator('[role="dialog"] button[data-missing-price-blocked="true"]')
        cart_blocked = {"count": blocked.count(), "disabled": blocked.first.is_disabled() if blocked.count() else None,
                        "sideCartDisabled": page.locator('[data-testid="design-add-all-to-cart"], button[aria-label*="cart" i]').first.is_disabled() if page.locator('[data-testid="design-add-all-to-cart"], button[aria-label*="cart" i]').count() else None}
        dialog_text = page.locator('[role="dialog"]').first.inner_text()
        page.screenshot(path=str(OUT / f"missing-price-{TAG}-materials.png"), full_page=False)
        close_dialogs(page)
    except Exception as exc:
        dialog_text = f"materials dialog not opened: {exc}"

    # 3D red outline
    page.get_by_test_id("switch-to-3d-view").click(timeout=15000)
    page.wait_for_timeout(2500)
    page.screenshot(path=str(OUT / f"missing-price-{TAG}-3d.png"), full_page=False)
    page.get_by_test_id("switch-to-floor-plan").click(timeout=15000)
    page.wait_for_timeout(800)

    # Part 4: click the flagged B48 -> popover with priced alternatives -> Accept
    popover = None
    accepted = None
    if flagged.count():
        flagged.first.click(timeout=8000, force=True)
        page.wait_for_timeout(2500)
        pop = page.get_by_test_id("missing-price-popover")
        if pop.count():
            popover = pop.inner_text()
            page.screenshot(path=str(OUT / f"missing-price-{TAG}-popover.png"), full_page=False)
            acc = page.get_by_test_id("missing-price-accept")
            if acc.count():
                acc.first.click(timeout=8000)
                page.wait_for_timeout(2500)
                accepted = page.locator("body").inner_text()
                page.screenshot(path=str(OUT / f"missing-price-{TAG}-after-accept.png"), full_page=False)

    persisted = page.evaluate(f"JSON.parse(localStorage.getItem({json.dumps(DRAFT_KEY)})).placed.map(p => ({{uid:p.uid, masterCode:p.masterCode, cabinetId:p.cabinetId, width:p.width, x:p.x, y:p.y}}))")
    after_flags = page.locator('[data-price-missing="true"]').count()
    after_banner = page.get_by_test_id("missing-price-banner").count()

    result = {
        "base": BASE, "tag": TAG, "bundles": [b.split("/")[-1] for b in bundle if "assets/" in b],
        "flaggedTitlesBefore": flagged_titles, "indicatorCount": indicator_count, "bannerText": banner_text,
        "erbLines": erb_line, "b48Lines": b48_line,
        "materialsBanner": materials_banner, "materialsFlags": materials_flags, "cartBlocked": cart_blocked,
        "materialsDialogExcerpt": [ln for ln in (dialog_text or "").splitlines() if any(k in ln for k in ("ERB36", "BER36", "B48", "PRICE", "missing"))][:12],
        "popover": popover, "acceptedBodyHasB48": (accepted or "").count("B48") if accepted else None,
        "placedAfter": persisted, "flagsAfterAccept": after_flags, "bannerAfterAccept": after_banner,
        "logMissingCalls": len(api_log), "applicationErrors": errors,
    }
    (OUT / f"missing-price-{TAG}.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))
    browser.close()
