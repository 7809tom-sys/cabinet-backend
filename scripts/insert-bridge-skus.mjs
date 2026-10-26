import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) { console.error("NO_DATABASE_URL"); process.exit(2); }
const DRY = process.argv.includes("--dry");

const conn = await mysql.createConnection(url);

// --- Cabinet master codes -> cabinetId (from audit) ---
const CAB_IDS = {
  "W-30-12": 299, "W-30-15": 302, "W-30-18": 305, "W-30-24": 308,
  "W-36-12": 330, "W-36-15": 333, "W-36-18": 336, "W-36-24": 339,
};

// --- distributor SKU code per master code (USCD uses no-dash codes) ---
const DIST_SKU = {
  "W-30-12": "W3012", "W-30-15": "W3015", "W-30-18": "W3018", "W-30-24": "W3024",
  "W-36-12": "W3612", "W-36-15": "W3615", "W-36-18": "W3618", "W-36-24": "W3624",
};

// --- PDF list prices per bridge code, by 4 finish columns [col1,col2,col3,col4] ---
const LIST = {
  "W-30-12": [375, 415, 435, 454],
  "W-36-12": [413, 456, 479, 500],
  "W-30-15": [419, 463, 486, 507],
  "W-36-15": [444, 492, 516, 538],
  "W-30-18": [456, 504, 529, 553],
  "W-36-18": [498, 550, 577, 603],
  "W-30-24": [545, 603, 633, 660],
  "W-36-24": [642, 710, 745, 778],
};

// --- styleCode -> price column index (0-3), matching USCD finish grouping ---
// Col1: SW,SA,SD,SG | Col2: SI,SN,SB,SH,SC,EW | Col3: OW,OS,CW,CS,HD | Col4: OM,OT,HE,SEO
const COL = {
  SW:0, SA:0, SD:0, SG:0,
  SI:1, SN:1, SB:1, SH:1, SC:1, EW:1,
  OW:2, OS:2, CW:2, CS:2, HD:2,
  OM:3, OT:3, HE:3, SEO:3,
};

// USCD styles from audit: id -> styleCode
const STYLES = {
  30043:"SA",30044:"SD",30045:"SG",30046:"SW",30047:"SI",30048:"SN",30049:"SB",
  30050:"SH",30051:"SC",30052:"EW",30053:"OW",30054:"OS",30055:"CW",30056:"CS",
  30057:"HD",30058:"OM",30059:"OT",30060:"HE",30061:"SEO",
};

const round2 = (n) => Math.round(n * 100) / 100;

// Price formula derived from existing USCD wall SKUs:
// yourCost=30% list, adjustedList=80% list, wholesale=50% list, contractor=60% list, homeowner=round(51% list)
function prices(list) {
  return {
    listPrice: round2(list),
    yourCost: round2(list * 0.30),
    adjustedListPrice: round2(list * 0.80),
    wholesalePrice: round2(list * 0.50),
    contractorPrice: round2(list * 0.60),
    homeownerPrice: Math.round(list * 0.51),
  };
}

let planned = 0, inserted = 0, skipped = 0;
const rows = [];

for (const [styleIdStr, styleCode] of Object.entries(STYLES)) {
  const styleId = Number(styleIdStr);
  const col = COL[styleCode];
  if (col === undefined) { console.error("NO COL for", styleCode); continue; }
  for (const [master, cabinetId] of Object.entries(CAB_IDS)) {
    const distSku = DIST_SKU[master];
    const list = LIST[master][col];
    const p = prices(list);
    const platformSku = `${distSku}-${styleCode}-UCD`;
    rows.push({ styleId, styleCode, master, cabinetId, distSku, platformSku, ...p });
    planned++;
  }
}

// Idempotency: check which platformSkus already exist.
const allPlatform = rows.map(r => r.platformSku);
const [existing] = await conn.query(
  `SELECT platformSku FROM distributor_skus WHERE platformSku IN (?)`, [allPlatform]
);
const existingSet = new Set(existing.map(e => e.platformSku));

const toInsert = rows.filter(r => !existingSet.has(r.platformSku));
skipped = rows.length - toInsert.length;

console.log(`Planned ${planned} SKUs; already exist ${skipped}; to insert ${toInsert.length}`);
console.log("Sample rows:");
for (const r of toInsert.slice(0, 4)) console.log("  ", r.platformSku, "list", r.listPrice, "cost", r.yourCost, "contr", r.contractorPrice, "home", r.homeownerPrice);
// Nimbus White (SD) sanity
const nimbus = toInsert.filter(r => r.styleCode === "SD");
console.log("Nimbus White (SD) rows:", nimbus.map(r => `${r.master}=$${r.listPrice}`).join(", "));

if (DRY) { console.log("DRY RUN — no insert"); await conn.end(); process.exit(0); }

if (toInsert.length) {
  const values = toInsert.map(r => [
    r.cabinetId, 1 /*distributorId USCD*/, r.styleId, r.platformSku, r.distSku,
    r.listPrice, r.yourCost, r.adjustedListPrice, r.wholesalePrice, r.contractorPrice, r.homeownerPrice,
    1 /*isAvailable*/, 1 /*isPublished*/,
  ]);
  const [res] = await conn.query(
    `INSERT INTO distributor_skus
      (cabinetId, distributorId, styleId, platformSku, distributorSku,
       listPrice, yourCost, adjustedListPrice, wholesalePrice, contractorPrice, homeownerPrice,
       isAvailable, isPublished)
     VALUES ?`, [values]
  );
  inserted = res.affectedRows;
}

console.log(`INSERTED ${inserted} rows.`);
await conn.end();
process.exit(0);
