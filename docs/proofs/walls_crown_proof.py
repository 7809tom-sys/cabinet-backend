import json
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:3000"
EMAIL = "walls-crown-proof@cabinetdealz.test"
DRAFT_KEY = f"cabinet-dealz:designer-draft:v2:owner:{EMAIL}"
ACTIVE_KEY = "cabinet-dealz:designer-draft:active:v2:owner"
OUT = Path("/tmp")
draft = json.loads(Path("/tmp/wall_crown_proof_draft.json").read_text())
draft["savedAt"] = int(time.time() * 1000)
if __import__("os").environ.get("MANUAL_CROWN") == "1":
    draft["trimManualOverride"]["crown"] = True


def close_dialogs(page):
    for _ in range(3):
        if page.locator('[role="dialog"]').count():
            page.keyboard.press("Escape")
            page.wait_for_timeout(250)

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, executable_path="/usr/bin/chromium", args=["--no-sandbox"])
    context = browser.new_context(viewport={"width": 1582, "height": 877}, device_scale_factor=1)
    page = context.new_page()
    errors = []
    page.on("console", lambda m: errors.append(f"{m.type}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.add_init_script(script=(
        f"localStorage.setItem({json.dumps(DRAFT_KEY)}, JSON.stringify({json.dumps(draft)}));"
        f"localStorage.setItem({json.dumps(ACTIVE_KEY)}, {json.dumps(DRAFT_KEY)});"
    ))
    page.goto(f"{BASE}/design?walls-crown-proof={int(time.time())}", wait_until="networkidle", timeout=60000)
    page.locator('input[type="email"]').fill(EMAIL)
    page.get_by_text("Launch Designer", exact=True).click(timeout=30000)
    try:
        page.get_by_test_id("beginner-first-cabinet-guide").get_by_text("I’ll explore first", exact=True).click(timeout=3000, force=True)
    except Exception:
        pass
    close_dialogs(page)
    three_d_switch = page.get_by_test_id("switch-to-3d-view")
    if three_d_switch.get_attribute("aria-pressed") != "true":
        three_d_switch.click(timeout=15000, force=True)
    page.wait_for_timeout(3500)

    context_toggle = page.get_by_test_id("three-d-room-context-toggle")
    context_visible = context_toggle.get_attribute("aria-pressed") == "true"
    toggle_label = context_toggle.inner_text()
    page.screenshot(path=str(OUT / f"walls-crown-local-{__import__("os").environ.get("TAG", "auto")}-3d.png"), full_page=False)

    # The legacy input intentionally says crown=true but manual override=false.
    # Correct restoration must remove that automatic crown and its material line.
    materials = page.get_by_role("button", name="Materials & Parts", exact=False).first
    materials.evaluate("element => element.click()")
    page.wait_for_timeout(1200)
    dialog_text = page.locator('[role="dialog"]').first.inner_text() if page.locator('[role="dialog"]').count() else ""
    crown_material_present = "CROWN MOLDING" in dialog_text.upper()
    page.screenshot(path=str(OUT / f"walls-crown-local-{__import__("os").environ.get("TAG", "auto")}-materials.png"), full_page=False)

    persisted = page.evaluate(f"JSON.parse(localStorage.getItem({json.dumps(DRAFT_KEY)}))")
    result = {
        "fixture": "saved 27-cabinet Madison kitchen; legacy automatic crown=true/manual=false",
        "contextVisible": context_visible,
        "toolbarLabel": toggle_label,
        "persistedCrown": persisted.get("crown"),
        "persistedManualCrown": (persisted.get("trimManualOverride") or {}).get("crown"),
        "crownMaterialPresent": crown_material_present,
        "dialogCrownLines": [line for line in dialog_text.splitlines() if "CROWN" in line.upper()],
        "applicationErrors": errors,
    }
    (OUT / f"walls-crown-local-{__import__("os").environ.get("TAG", "auto")}.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))
    browser.close()
