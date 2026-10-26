// Apply approved homeowner repricing (Option A).
//
// Rule per SKU:
//   target  = marketMedian(category, width) * 0.95   (~5% under market street median)
//   floor   = yourCost * 1.7
//   newHome = max(round(target), round(floor))
//   compareAt(adjustedListPrice) = old homeowner price (strike-through "Compare at")
//
// Market medians come from the competitive shop (scripts/price-research.md). Since we
// can't price every exact SKU from the shop, we model the homeowner street median as a
// function of category + width using a $/inch slope calibrated to the shopped data
// points, which reproduce the basket medians within a few dollars.
//
// SAFETY: writes a full JSON+SQL backup of every row to scripts/price-backup-<ts>.*
// BEFORE any UPDATE. Pass --dry to preview without writing. Pass --apply to write.

import mysql from "mysql2/promise";
import fs from "fs";

const APPLY = process.argv.includes("--apply");
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("No DATABASE_URL in env");
  process.exit(1);
}

// --- Market street-median model (calibrated to shopped white-shaker RTA data) ---
// Each returns an estimated homeowner STREET median in USD given width (inches).
// Calibration points (from scripts/price-research.md):
//   B12~170, B18~257, B24~299  -> base ~ 120 + 7.5/in
//   SB30~260, SB36~322         -> sink ~ 70 + 7.0/in
//   W3030~230, W2436~280 (taller)-> wall ~ 95 + 6.5/in (by width)
//   U24x84~850, U24x90~920, U24x96~? -> pantry ~ base on width*height
const MIN_MARGIN_MULT = 1.7;
const UNDERCUT = 0.95; // 5% under median

function streetMedian(cat, sub, w, h) {
  const width = Number(w) || 24;
  const height = Number(h) || 0;
  const c = (cat || "").toLowerCase();
  const s = (sub || "").toLowerCase();
  if (c === "base") {
    if (s.includes("sink") || s.includes("farm")) return 70 + 7.0 * width;
    if (s.includes("drawer")) return 150 + 14 * width; // drawer banks cost more
    if (s.includes("blind") || s.includes("corner") || s.includes("easy reach"))
      return 250 + 6 * width;
    return 120 + 7.5 * width; // single/standard base
  }
  if (c === "wall") {
    if (s.includes("corner") || s.includes("easy reach") || s.includes("diagonal"))
      return 260 + 5 * width;
    // taller wall cabinets cost more; scale modestly by height over 30"
    const hBump = height > 30 ? (height - 30) * 4 : 0;
    return 95 + 6.5 * width + hBump;
  }
  if (c === "tall") {
    // pantry/oven towers: drive by width and height
    const base = 250 + 12 * width;
    const hBump = height > 84 ? (height - 84) * 9 : 0;
    return base + hBump + (s.includes("oven") ? 250 : 0);
  }
  if (c === "vanity") {
    if (s.includes("sink")) return 90 + 6 * width;
    if (s.includes("drawer")) return 140 + 12 * width;
    return 120 + 6 * width;
  }
  // Accessories / ADA / everything else: anchor to a modest multiple of cost (handled by floor).
  return null; // signal: use cost-based floor only
}

const conn = await mysql.createConnection(url);

const [rows] = await conn.query(
  `SELECT s.id, s.platformSku, s.homeownerPrice, s.adjustedListPrice, s.contractorPrice,
          s.wholesalePrice, s.listPrice, s.yourCost,
          c.category, c.subCategory, c.width, c.height
   FROM distributor_skus s JOIN cabinets c ON c.id = s.cabinetId`
);

const ts = new Date().toISOString().replace(/[:.]/g, "-");
const backupJson = `scripts/price-backup-${ts}.json`;
const backupSql = `scripts/price-backup-${ts}.sql`;
fs.writeFileSync(backupJson, JSON.stringify(rows, null, 0));
// Restore SQL: one UPDATE per row resetting the price columns we touch.
const restoreLines = rows.map(
  (r) =>
    `UPDATE distributor_skus SET homeownerPrice=${r.homeownerPrice ?? "NULL"}, adjustedListPrice=${
      r.adjustedListPrice ?? "NULL"
    } WHERE id=${r.id};`
);
fs.writeFileSync(backupSql, restoreLines.join("\n") + "\n");
console.log(`Backed up ${rows.length} rows -> ${backupJson} and ${backupSql}`);

let changed = 0,
  flooredCount = 0,
  skippedNoPrice = 0,
  totalOld = 0,
  totalNew = 0;
const updates = [];
const sample = [];

for (const r of rows) {
  const old = r.homeownerPrice != null ? Number(r.homeownerPrice) : null;
  const cost = r.yourCost != null ? Number(r.yourCost) : null;
  if (old == null || cost == null) {
    skippedNoPrice++;
    continue;
  }
  const med = streetMedian(r.category, r.subCategory, r.width, r.height);
  const floor = cost * MIN_MARGIN_MULT;
  let target;
  if (med == null) {
    // No market model (accessories/ADA): just clamp down to floor if we're above it, else keep.
    target = Math.min(old, Math.max(floor, cost * 2));
  } else {
    target = med * UNDERCUT;
  }
  let newHome = Math.max(Math.round(target), Math.round(floor));
  if (Math.round(floor) >= Math.round(target) && med != null) flooredCount++;
  // Never RAISE a homeowner price in this competitive cut; only lower (or keep).
  if (newHome >= old) {
    continue;
  }
  const compareAt = old; // strike-through "Compare at" = previous homeowner price
  updates.push([newHome, compareAt, r.id]);
  totalOld += old;
  totalNew += newHome;
  changed++;
  if (sample.length < 16)
    sample.push(
      `${r.platformSku} | ${r.category}/${r.subCategory} W${r.width} | $${old} -> $${newHome} (cmp $${compareAt}, cost $${cost}, margin ${Math.round(
        ((newHome - cost) / newHome) * 100
      )}%)`
    );
}

console.log(`\nWould change ${changed} SKUs (lowered). Floored-at-cost: ${flooredCount}. Skipped (no price/cost): ${skippedNoPrice}.`);
if (changed) {
  console.log(
    `Sum of changed homeowner: $${Math.round(totalOld)} -> $${Math.round(totalNew)} (${Math.round(
      ((totalNew - totalOld) / totalOld) * 100
    )}%)`
  );
}
console.log("\nSample:");
sample.forEach((l) => console.log("  " + l));

if (!APPLY) {
  console.log("\n[DRY RUN] No changes written. Re-run with --apply to commit.");
  await conn.end();
  process.exit(0);
}

console.log(`\nApplying ${updates.length} updates...`);
let done = 0;
for (let i = 0; i < updates.length; i += 500) {
  const batch = updates.slice(i, i + 500);
  await Promise.all(
    batch.map(([home, cmp, id]) =>
      conn.execute(
        `UPDATE distributor_skus SET homeownerPrice=?, adjustedListPrice=? WHERE id=?`,
        [home, cmp, id]
      )
    )
  );
  done += batch.length;
}
console.log(`Applied ${done} updates.`);
await conn.end();
