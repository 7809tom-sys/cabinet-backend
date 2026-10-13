#!/usr/bin/env python3
"""Open each CRM-linked design in headless Chromium (as the CRM does, via ?load=&crmDeal=) and read the
Designer's current "Estimated Total". Read-only: save / lead-capture calls are blocked and the server is
started with CD_SKIP_VIEW_LOG=1 so no "viewed" rows are written.

usage: read-totals.py <outDir> <baseUrl> [maxDeals]
"""
import json, sys, re
from playwright.sync_api import sync_playwright

out_dir, base = sys.argv[1], sys.argv[2].rstrip("/")
max_deals = int(sys.argv[3]) if len(sys.argv) > 3 else 10_000
deals = json.load(open(f"{out_dir}/deals.json"))
token = open(f"{out_dir}/token.txt").read().strip()
host = re.sub(r"^https?://", "", base).split(":")[0]
targets = [d for d in deals if d["designs"]][:max_deals]
results = {}
BLOCK = re.compile(r"design\.captureLead|design\.save|orders\.submit|crm\.sendEmail")

GRAB = """() => { const t=document.body.innerText; const m=t.match(/Estimated Total[\\s\\S]{0,40}?\\$\\s?([\\d,]+\\.\\d{2})/);
  const miss=t.match(/(\\d+) cabinets? missing prices?/i); const items=t.match(/(\\d+) items/);
  return {total: m?m[1].replace(/,/g,''):null, missing: miss?miss[0]:null, items: items?items[1]:null}; }"""


def read_design(b, deal, design):
    ctx = b.new_context(viewport={"width": 1500, "height": 900})
    ctx.add_cookies([{"name": "app_session_id", "value": token, "domain": host, "path": "/"}])
    pg = ctx.new_page()
    pg.route("**/api/trpc/**", lambda r: r.abort() if BLOCK.search(r.request.url) else r.continue_())
    scope = f"/store/{deal['slug']}/design" if deal.get("slug") else "/design"
    url = f"{base}{scope}?load={design['id']}&crmDeal={deal['id']}"
    info = {"design": design["id"], "name": design["name"], "total": None, "missing": None, "items": None, "status": "ok"}
    try:
        pg.goto(url, wait_until="load", timeout=90000)
        hist = []
        for _ in range(45):  # up to ~3 min for the design to load and price
            pg.wait_for_timeout(4000)
            g = pg.evaluate(GRAB)
            hist.append(g["total"])
            info.update({k: g[k] for k in ("missing", "items")})
            if g["total"] not in (None, "0.00") and len(hist) >= 4 and len(set(hist[-4:])) == 1:
                info["total"] = g["total"]
                break
            # Cabinets with no catalog price make the Designer total $0.00: record that instead of waiting forever.
            if g["total"] == "0.00" and g["missing"] and g["items"] not in (None, "0") and len(hist) >= 6 and len(set(hist[-6:])) == 1:
                info["total"] = "0.00"
                info["status"] = "missing_prices"
                break
        if info["total"] is None:
            info["status"] = "unreadable"
            info["note"] = "Designer showed no total (design empty, still loading, or not openable)"
    except Exception as e:  # noqa: BLE001
        info["status"] = "unreadable"
        info["note"] = str(e)[:160]
    ctx.close()
    return info


with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/chromium",
                          args=["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    for i, d in enumerate(targets, 1):
        rs = []
        for des in d["designs"]:
            rs.append(read_design(b, d, des))
            print(f"[{i}/{len(targets)}] deal {d['id']} design {des['id']} -> {rs[-1]['total']} ({rs[-1]['status']})", flush=True)
        results[str(d["id"])] = rs
        json.dump(results, open(f"{out_dir}/totals.json", "w"), indent=1)  # keep partial progress
    b.close()
print("DONE", len(results), flush=True)
