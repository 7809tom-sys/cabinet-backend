#!/usr/bin/env python3
"""Build the side-by-side mismatch report from deals.json + totals.json. Never touches the database.

usage: build-report.py <outDir> [withSnapshot]
"""
import json, sys, csv, datetime
from decimal import Decimal as D

out_dir = sys.argv[1]
deals = json.load(open(f"{out_dir}/deals.json"))
totals = json.load(open(f"{out_dir}/totals.json"))
snap = json.load(open(f"{out_dir}/snapshot_check.json")) if len(sys.argv) > 2 else None


def money(x):
    return "—" if x is None else f"${D(str(x)):,.2f}"


rows = []
for d in deals:
    if not d["designs"]:
        continue
    rs = totals.get(str(d["id"]), [])
    read = [(r, D(r["total"])) for r in rs if r.get("total") and r.get("status") != "missing_prices"]
    blocked = [r for r in rs if r.get("status") == "missing_prices"]
    price = D(str(d["price"])) if d["price"] else None
    newest = rs[0] if rs else None
    newest_total = D(newest["total"]) if newest and newest.get("total") else None
    row = {"deal": d["id"], "customer": d.get("name") or d.get("email") or "—", "dealPrice": price,
           "designs": len(d["designs"]), "designName": d["designs"][0]["name"], "designId": d["designs"][0]["id"],
           "designerTotal": newest_total, "gap": None, "saved": str(d["designs"][0]["savedAt"])[:10],
           "dealUpdated": str(d["updatedAt"])[:10], "store": d.get("slug") or "house", "note": ""}
    if blocked and not read:
        row["status"] = "CAN'T PRICE"
        row["designerTotal"] = None
        row["note"] = f"Designer total is $0.00 because of missing catalog prices ({blocked[0].get('missing')})"
    elif not read:
        row["status"] = "UNREADABLE"
        row["note"] = (newest or {}).get("note") or "no total shown"
    elif price is None:
        row["status"] = "NO DEAL PRICE"
    else:
        if any(abs(price - t) < D("0.01") for _, t in read):
            row["status"] = "MATCH"
            row["gap"] = D("0")
        else:
            row["status"] = "MISMATCH"
            row["gap"] = price - (newest_total if newest_total is not None else read[0][1])
    if len(d["designs"]) > 1:
        row["note"] = (row["note"] + " " if row["note"] else "") + "multi-design deal; totals: " + ", ".join(
            f"#{r['design']}={money(r.get('total'))}" for r in rs)
    if rs and rs[0].get("missing"):
        row["note"] += f" [{rs[0]['missing']}]"
    rows.append(row)

order = {"MISMATCH": 0, "NO DEAL PRICE": 1, "CAN'T PRICE": 2, "UNREADABLE": 3, "MATCH": 4}
rows.sort(key=lambda r: (order[r["status"]], -abs(r["gap"] or 0), r["deal"]))
today = datetime.date.today().isoformat()
cnt = {k: sum(1 for r in rows if r["status"] == k) for k in order}
md = [f"# Weekly CRM price check — {today}", "",
      "**Report only. No CRM prices were changed.** Compared each CRM deal's price with the Designer's current Estimated Total for its linked design.", "",
      f"Deals checked: **{len(rows)}**  |  Mismatch: **{cnt['MISMATCH']}**  |  No deal price: **{cnt['NO DEAL PRICE']}**  |  Designer can't price: **{cnt["CAN'T PRICE"]}**  |  Unreadable: **{cnt['UNREADABLE']}**  |  Match: **{cnt['MATCH']}**", "",
      "Gap = CRM price minus Designer total (positive means the CRM is higher).", ""]


def table(title, sel):
    sub = [r for r in rows if r["status"] in sel]
    if not sub:
        return
    md.extend([f"## {title}", "",
               "| Deal | Customer | Design | CRM price | Designer total | Gap | Design saved | Deal updated | Notes |",
               "|---|---|---|---:|---:|---:|---|---|---|"])
    for r in sub:
        gap = "—" if r["gap"] is None else f"{r['gap']:+,.2f}"
        md.append(f"| {r['deal']} | {r['customer']} | #{r['designId']} {r['designName']} | {money(r['dealPrice'])} | {money(r['designerTotal'])} | {gap} | {r['saved']} | {r['dealUpdated']} | {r['note'].strip()} |")
    md.append("")


table("Mismatches (CRM price differs from the Designer)", {"MISMATCH"})
table("No price on the CRM deal (Designer total available)", {"NO DEAL PRICE"})
table("Designer cannot price these designs (missing catalog prices)", {"CAN'T PRICE"})
table("Could not read a Designer total", {"UNREADABLE"})
table("Matches", {"MATCH"})
if snap:
    md.extend(["## Safety proof", "", f"- Before: `{json.dumps(snap['before'])}`", f"- After:  `{json.dumps(snap['after'])}`",
               f"- Result: **{'UNCHANGED — nothing was written' if snap['unchanged'] else 'CHANGED — investigate'}**", ""])
open(f"{out_dir}/report.md", "w").write("\n".join(md))
with open(f"{out_dir}/report.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["status", "deal", "customer", "design_id", "design_name", "crm_price", "designer_total", "gap", "design_saved", "deal_updated", "store", "notes"])
    for r in rows:
        w.writerow([r["status"], r["deal"], r["customer"], r["designId"], r["designName"], r["dealPrice"] or "", r["designerTotal"] or "",
                    r["gap"] if r["gap"] is not None else "", r["saved"], r["dealUpdated"], r["store"], r["note"].strip()])
print("REPORT", f"{out_dir}/report.md", cnt)
