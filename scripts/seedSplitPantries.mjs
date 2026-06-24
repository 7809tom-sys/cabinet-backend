// Seed Faircrest (Clark & Son, distributorId=2) split pantries.
// Creates: cabinets (bottoms + tops), per-finish distributor_skus, pantry_bundles,
// and a Clark & Son "Rustic Hickory" door style (id 30062) for the RH column.
// Reads DATABASE_URL from the running dev server process env.
//
// Run: node scripts/seedSplitPantries.mjs
import mysql from "mysql2/promise";
import { execSync } from "node:child_process";

function readDbUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  // Pull from the running dev server process environment.
  const pid = execSync("pgrep -f 'tsx watch server/_core/index.ts' | head -1").toString().trim();
  if (!pid) throw new Error("dev server pid not found and DATABASE_URL unset");
  const environ = execSync(`sudo cat /proc/${pid}/environ`).toString();
  const entry = environ.split("\0").find((l) => l.startsWith("DATABASE_URL="));
  if (!entry) throw new Error("DATABASE_URL not found in dev server env");
  return entry.slice("DATABASE_URL=".length);
}

// ─── Door-style legend → existing styleId (all distributor 2 except RH which we create) ───
const DIST = 2; // Clark & Son / Faircrest line
const RH_STYLE_ID = 30062; // new Clark & Son Rustic Hickory
const STYLE = {
  HS: 30005,  // Hickory Shaker -> Silva Shaker
  NG: 30007,  // Winchester Grey -> Slate Echo
  PS: 30008,  // Platinum Shaker -> Sterling Pulse
  WPG: 30009, // West Point Grey -> Nimbus Grey
  WS: 30010,  // White Shaker -> Nova White
  MBS: 30006, // Midnight Black Shaker -> Onyx Shadow
  FS: 30004,  // Fresh Sage -> Zenith Sage
  CS: 30003,  // Carmel Shaker -> Terra Shaker
  RH: RH_STYLE_ID, // Rustic Hickory -> Sylvan Rust (new, Clark & Son)
};
const FINISHES = ["HS", "NG", "PS", "WPG", "WS", "MBS", "FS", "CS", "RH"];

// ─── BOTTOM WALL CABINET FOR SPLIT PANTRIES (54"H x 24"D) ───
// price columns in legend order; null = N/A (skip)
const BOTTOMS = {
  // masterCode: { w, prices: {HS,NG,PS,WPG,WS,MBS,FS,CS,RH} }
  UCB2454: { w: 24, prices: { HS: 1167.19, NG: 1167.19, PS: 804.96, WPG: 1167.19, WS: 804.96, MBS: 845.21, FS: 845.21, CS: 861.31, RH: 1167.19 } },
  UCB3054: { w: 30, prices: { HS: 1360.56, NG: 1360.56, PS: 938.32, WPG: 1360.56, WS: 938.32, MBS: 985.24, FS: 985.24, CS: 1004.00, RH: 1360.56 } },
  UCB3654: { w: 36, prices: { HS: 1553.82, NG: 1553.82, PS: 1071.60, WPG: 1553.82, WS: 1071.60, MBS: 1125.18, FS: 1125.18, CS: 1146.61, RH: 1553.82 } },
};

// ─── TOP WALL CABINET FOR SPLIT PANTRIES (24"D; heights 30/36/42) ───
const TOPS = {
  W243024: { w: 24, h: 30, prices: { HS: 769.31, NG: 769.31, PS: 530.56, WPG: 769.31, WS: 530.56, MBS: 557.09, FS: 557.09, CS: 567.70, RH: 769.31 } },
  W243624: { w: 24, h: 36, prices: { HS: 850.86, NG: 850.86, PS: 586.80, WPG: 850.86, WS: 586.80, MBS: 616.14, FS: 616.14, CS: 627.88, RH: 850.86 } },
  W244224: { w: 24, h: 42, prices: { HS: 932.99, NG: 932.99, PS: 643.44, WPG: 932.99, WS: 643.44, MBS: 675.61, FS: 675.61, CS: 688.48, RH: 932.99 } },
  W303024: { w: 30, h: 30, prices: { HS: 900.86, NG: 900.86, PS: 621.28, WPG: 900.86, WS: 621.28, MBS: 652.34, FS: 652.34, CS: 664.77, RH: 900.86 } },
  W303624: { w: 30, h: 36, prices: { HS: 994.12, NG: 994.12, PS: 685.60, WPG: 994.12, WS: 685.60, MBS: 719.88, FS: 719.88, CS: 733.59, RH: 994.12 } },
  W304224: { w: 30, h: 42, prices: { HS: 1087.96, NG: 1087.96, PS: 750.32, WPG: 1087.96, WS: 750.32, MBS: 787.84, FS: 787.84, CS: 802.84, RH: 1087.96 } },
  W363024: { w: 36, h: 30, prices: { HS: 1032.40, NG: 1032.40, PS: 712.00, WPG: 1032.40, WS: 712.00, MBS: 747.60, FS: 747.60, CS: 761.84, RH: 1032.40 } },
  W363624: { w: 36, h: 36, prices: { HS: 1137.38, NG: 1137.38, PS: 784.40, WPG: 1137.38, WS: 784.40, MBS: 823.62, FS: 823.62, CS: 839.31, RH: 1137.38 } },
  W364224: { w: 36, h: 42, prices: { HS: 1242.94, NG: 1242.94, PS: 857.20, WPG: 1242.94, WS: 857.20, MBS: 900.06, FS: 900.06, CS: 917.20, RH: 1242.94 } },
};

// Total height = bottom 54 + top height. Pair same width bottom+top.
function topsForWidth(w) {
  return Object.entries(TOPS).filter(([, t]) => t.w === w).map(([code]) => code);
}

const round2 = (n) => Math.round(n * 100) / 100;

async function main() {
  const url = readDbUrl();
  const conn = await mysql.createConnection(url + (url.includes("?") ? "&" : "?") + "multipleStatements=true");
  console.log("Connected.");

  // 1) Ensure Clark & Son Rustic Hickory style exists (white-label name Sylvan Rust).
  const [rhExists] = await conn.execute("SELECT id FROM door_styles WHERE id=?", [RH_STYLE_ID]);
  if (rhExists.length === 0) {
    await conn.execute(
      `INSERT INTO door_styles (id, distributorId, styleCode, ourName, distributorName, doorStyle, woodSpecies, finish, color, overlayType, isFeatured, featuredRank, isActive)
       VALUES (?, ?, 'RH', 'Sylvan Rust', 'Rustic Hickory', 'Shaker', 'Hickory', 'Matching', 'Rustic Hickory', 'Full', 0, 0, 1)`,
      [RH_STYLE_ID, DIST]
    );
    console.log(`Created Clark & Son Rustic Hickory style id=${RH_STYLE_ID}`);
  } else {
    console.log("Rustic Hickory (Clark & Son) style already present.");
  }

  // 2) Insert cabinets (bottoms + tops) if missing; collect their ids by masterCode.
  const cabIdByCode = {};
  async function upsertCabinet(masterCode, desc, w, h) {
    const [rows] = await conn.execute("SELECT id FROM cabinets WHERE masterCode=?", [masterCode]);
    if (rows.length) { cabIdByCode[masterCode] = rows[0].id; return; }
    const [res] = await conn.execute(
      `INSERT INTO cabinets (masterCode, description, descriptionSource, category, subCategory, width, height, depth, placementType, isActive)
       VALUES (?, ?, 'Clark & Son', 'Tall', 'Split Pantry', ?, ?, 24, 'tall', 1)`,
      [masterCode, desc, w, h]
    );
    cabIdByCode[masterCode] = res.insertId;
  }

  for (const [code, b] of Object.entries(BOTTOMS)) {
    await upsertCabinet(code, `${b.w}" Split Pantry Bottom Cabinet (54"H x 24"D)`, b.w, 54);
  }
  for (const [code, t] of Object.entries(TOPS)) {
    await upsertCabinet(code, `${t.w}" x ${t.h}" Split Pantry Top Wall Cabinet (24"D)`, t.w, t.h);
  }
  console.log("Cabinets ready:", Object.keys(cabIdByCode).length);

  // 3) Insert distributor_skus per available finish (skip N/A nulls).
  async function upsertSku(masterCode, finish, price) {
    if (price == null) return;
    const cabinetId = cabIdByCode[masterCode];
    const styleId = STYLE[finish];
    const platformSku = `${masterCode}-${finish}-CS2`;
    const [rows] = await conn.execute("SELECT id FROM distributor_skus WHERE platformSku=?", [platformSku]);
    if (rows.length) {
      await conn.execute(
        `UPDATE distributor_skus SET listPrice=?, wholesalePrice=?, contractorPrice=?, homeownerPrice=?, isAvailable=1, isPublished=1 WHERE platformSku=?`,
        [price, price, price, price, platformSku]
      );
      return;
    }
    await conn.execute(
      `INSERT INTO distributor_skus (cabinetId, distributorId, styleId, platformSku, distributorSku, listPrice, wholesalePrice, contractorPrice, homeownerPrice, isAvailable, isPublished, supplierCabinetName)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?)`,
      [cabinetId, DIST, styleId, platformSku, `${masterCode}-${finish}`, price, price, price, price, `${masterCode} ${finish}`]
    );
  }

  let skuCount = 0;
  for (const [code, b] of Object.entries(BOTTOMS)) {
    for (const f of FINISHES) { await upsertSku(code, f, b.prices[f] ?? null); skuCount++; }
  }
  for (const [code, t] of Object.entries(TOPS)) {
    for (const f of FINISHES) { await upsertSku(code, f, t.prices[f] ?? null); skuCount++; }
  }
  console.log("SKUs processed:", skuCount);

  // 4) Populate pantry_bundles: each width x topHeight x finish.
  await conn.execute("DELETE FROM pantry_bundles WHERE platformSku LIKE 'SP-%'");
  let bundleCount = 0;
  for (const [bcode, b] of Object.entries(BOTTOMS)) {
    for (const tcode of topsForWidth(b.w)) {
      const t = TOPS[tcode];
      const totalHeight = 54 + t.h;
      for (const f of FINISHES) {
        const bp = b.prices[f];
        const tp = t.prices[f];
        if (bp == null || tp == null) continue;
        const combined = round2(bp + tp);
        const platformSku = `SP-${b.w}-${totalHeight}-${f}`;
        await conn.execute(
          `INSERT INTO pantry_bundles (platformSku, distributorId, styleId, width, totalHeight, bottomSku, topSku, bottomListPrice, topListPrice, combinedListPrice, adjustedListPrice, wholesalePrice, contractorPrice, homeownerPrice)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [platformSku, DIST, STYLE[f], b.w, totalHeight, bcode, tcode, bp, tp, combined, combined, combined, combined, combined]
        );
        bundleCount++;
      }
    }
  }
  console.log("Bundles inserted:", bundleCount);

  await conn.end();
  console.log("DONE.");
}

main().catch((e) => { console.error(e); process.exit(1); });
