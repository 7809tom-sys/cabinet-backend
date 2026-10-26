// Deterministic homeowner pricing recommendation.
// Compares our current homeowner price vs competitor street (sale) prices,
// computes a market median, and recommends a homeowner price ~5% under median,
// floored so it never drops below cost floor * MIN_MARGIN_MULT.

const MIN_MARGIN_MULT = 1.7; // homeowner price must stay >= cost floor * 1.7
const UNDERCUT = 0.05; // target ~5% under market street median

// Basket: each row = our current data + observed competitor street prices (USD).
// Competitor prices are the ACTUAL checkout/sale price a homeowner pays.
const basket = [
  { sku: "B-12 base 12\"", ours: 454, floor: 143, comps: [182, 158] },
  { sku: "B-18 base 18\"", ours: 531, floor: 154, comps: [199, 316, 257] },
  { sku: "B-24 base 24\"", ours: 538, floor: 157, comps: [326, 375, 299, 280, 246] },
  { sku: "DB-24 drawer base 24\"", ours: 906, floor: 291, comps: [430, 470, 520] },
  { sku: "SB-30 sink base 30\"", ours: 498, floor: 140, comps: [278, 260, 240] },
  { sku: "SB-36 sink base 36\"", ours: 639, floor: 162, comps: [591, 279, 330, 314] },
  { sku: "W-30-30 wall 30x30", ours: 416, floor: 113, comps: [204, 230, 250] },
  { sku: "W-24-36 wall 24x36", ours: 472, floor: 113, comps: [240, 300, 280] },
  { sku: "U-24-84 pantry", ours: 1340, floor: 319, comps: [780, 900, 850] },
  { sku: "U-24-90 pantry", ours: 1403, floor: 345, comps: [850, 980, 920] },
];

function median(arr) {
  const a = [...arr].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
}

let totOurs = 0,
  totReco = 0,
  totMedian = 0;

const rows = basket.map((r) => {
  const med = median(r.comps);
  const floorGuard = Math.round(r.floor * MIN_MARGIN_MULT);
  let reco = Math.round(med * (1 - UNDERCUT));
  let note = "~5% under market";
  if (reco < floorGuard) {
    reco = floorGuard;
    note = `floored at cost x${MIN_MARGIN_MULT}`;
  }
  const vsOursPct = Math.round(((reco - r.ours) / r.ours) * 100);
  const recoMarginPct = Math.round(((reco - r.floor) / reco) * 100);
  totOurs += r.ours;
  totReco += reco;
  totMedian += med;
  return { ...r, med, reco, note, vsOursPct, recoMarginPct, floorGuard };
});

console.log(
  "SKU".padEnd(24),
  "Ours".padStart(6),
  "Mkt med".padStart(8),
  "Reco".padStart(6),
  "vs ours".padStart(8),
  "margin".padStart(7),
  "  note"
);
for (const r of rows) {
  console.log(
    r.sku.padEnd(24),
    `$${r.ours}`.padStart(6),
    `$${r.med}`.padStart(8),
    `$${r.reco}`.padStart(6),
    `${r.vsOursPct}%`.padStart(8),
    `${r.recoMarginPct}%`.padStart(7),
    "  " + r.note
  );
}
console.log("");
console.log(
  `Basket totals: ours $${totOurs}  market-median $${totMedian}  recommended $${totReco}`
);
console.log(
  `Recommended basket is ${Math.round(((totReco - totOurs) / totOurs) * 100)}% vs our current homeowner prices, and ${Math.round(
    ((totReco - totMedian) / totMedian) * 100
  )}% vs market median.`
);
