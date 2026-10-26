/**
 * Import Skyline (distributor 3) corner cabinet SKUs from the July Final Version
 * Master Logic Google Sheet into the distributor_skus table.
 *
 * Run from project root:
 *   npx tsx scripts/import_skyline_corner.mts
 */
import { execSync } from "child_process";
import { drizzle } from "drizzle-orm/mysql2";
import { eq, and } from "drizzle-orm";
import { cabinets, distributorSkus, doorStyles } from "../drizzle/schema";

const SPREADSHEET_ID = "1yb-2tU3SjO1G26G0h9D10-gSwFqEZilUUtg4Xtym8ek";
const DISTRIBUTOR_ID = 3;

// Style code → 0-based column index of the SKU value in the sheet
const STYLE_COLS: Record<string, number> = {
  SW: 7, GR: 10, SE: 13, NB: 16, AG: 19, IB: 22, SA: 25, LG: 28, SB: 31, TC: 34,
};

// Skyline item code → canonical masterCode in DB
const ALIAS: Record<string, string> = {
  "BBC-36": "BBC36", "BBC-39": "BBC36", "BBC-42": "BBC42", "BBC-45": "BBC45",
  "WBC24-30": "WBC2430", "WBC24-42": "WBC2442",
  "WBC27-30": "WBC2730", "WBC27-36": "WBC2736", "WBC27-42": "WBC2742",
  "WBC36-30": "WBC3630", "WBC36-42": "WBC3642",
  "DCW24-12GD": "DCW2412GD", "DCW24-15GD": "DCW2415GD", "DCW24-18GD": "DCW2418GD",
  "DCW24-30": "DCW2430", "DCW24-30GD": "DCW2430GD",
  "DCW24-36": "DCW2436", "DCW24-36GD": "DCW2436GD",
  "DCW24-42": "DCW2442", "DCW24-42GD": "DCW2442GD",
  "DCW27-12GD": "DCW2712GD", "DCW27-36": "DCW2736", "DCW27-42": "DCW2742",
  "WER24-12GD": "WER2412GD", "WER24-15GD": "WER2415GD", "WER24-18GD": "WER2418GD",
  "WER24-30": "WER2430", "WER24-36": "WER2436", "WER24-42": "WER2442",
  "CSB-36": "CSB36", "DCSF-42": "DCSF42", "BEC-24": "BEC24",
};

const CORNER_KEYWORDS = [
  "BBC", "WBC", "CDB", "DCSB", "WCA", "LSB", "LS33", "LS36",
  "WDC", "DCW", "WER", "BEC", "CSB", "DCSF", "RHC", "SBA",
];

function isCornerRow(row: string[]): boolean {
  // Only check the item code (col 3) and base SKU (col 4) — not description (col 5)
  // to avoid false positives where description mentions corner-related words.
  const checkCols = [0, 1, 3, 4];
  for (const i of checkCols) {
    if (i >= row.length) continue;
    const v = (row[i] || "").toUpperCase().replace(/-/g, "");
    if (CORNER_KEYWORDS.some(k => v.startsWith(k))) return true;
  }
  return false;
}

function getSku(row: string[], _col: number): string | null {
  // Skyline sheet has no per-style SKU — the base SKU (col 4) is shared across all styles.
  const v = (row[4] || "").trim();
  if (!v || v === "0") return null;
  return v;
}

function getPrice(row: string[], col: number): string | null {
  // In the Skyline sheet, col is the "Our Price" column directly (not col+1).
  // The header shows: SW(7)=price, SW Our Price(8)=our_price, SW Adj List Price(9)=adj_list
  // But the actual data shows col7=479 (list), col8=143.7 (our price), col9=$479.00 (adj list)
  // Use col+1 (our price) as the wholesale price.
  const priceCol = col + 1;
  if (priceCol >= row.length) return null;
  const v = (row[priceCol] || "").replace(/[$,]/g, "").trim();
  const f = parseFloat(v);
  return f > 0 ? f.toFixed(2) : null;
}

function getAdjList(row: string[], col: number): string | null {
  // col is the list price column; col+2 is the adj list price (e.g. $479.00)
  const adjCol = col + 2;
  if (adjCol >= row.length) return null;
  const v = (row[adjCol] || "").replace(/[$,]/g, "").trim();
  const f = parseFloat(v);
  return f > 0 ? f.toFixed(2) : null;
}

// ── 1. Fetch sheet data via gws CLI ─────────────────────────────────────────
console.log("Fetching Skyline sheet...");
const gwsOut = execSync(
  `gws sheets spreadsheets values get --params '${JSON.stringify({
    spreadsheetId: SPREADSHEET_ID,
    range: "Skyline!A1:AJ500",
  })}'`,
  { encoding: "utf8" }
);
const sheetData = JSON.parse(gwsOut) as { values: string[][] };
const rows = sheetData.values ?? [];
console.log(`  Total rows: ${rows.length}`);
console.log(`  First data row sample:`, JSON.stringify(rows[1]?.slice(0, 7)));
console.log(`  Row 65 sample:`, JSON.stringify(rows[64]?.slice(0, 7)));
console.log(`  isCornerRow(row65):`, isCornerRow(rows[64] ?? []));
console.log(`  isCornerRow(['BBC-36','BBC-36','x','BBC-36','BBC36','y','1']):`, isCornerRow(['BBC-36','BBC-36','x','BBC-36','BBC36','y','1']));

// ── 2. Extract corner cabinet records ────────────────────────────────────────
type Record_ = {
  item_code: string;
  base_sku: string;
  style_code: string;
  style_sku: string;
  our_price: string;
  adj_list_price: string | null;
};
const records: Record_[] = [];

for (const row of rows.slice(1)) {
  if (!row.length || !isCornerRow(row)) continue;
  const item_code = (row[3] || "").trim();
  const base_sku = (row[4] || "").trim();
  if (!item_code && !base_sku) continue;

  for (const [style_code, col] of Object.entries(STYLE_COLS)) {
    const style_sku = getSku(row, col);
    const our_price = getPrice(row, col);
    const adj_list_price = getAdjList(row, col);
    if (style_sku && our_price) {
      records.push({ item_code, base_sku, style_code, style_sku, our_price, adj_list_price });
    }
  }
}
console.log(`  Corner cabinet SKU records found: ${records.length}`);
if (records.length === 0) {
  console.log("No records to import. Exiting.");
  process.exit(0);
}

// ── 3. Import into DB ────────────────────────────────────────────────────────
const db = drizzle(process.env.DATABASE_URL!);

const styles = await db
  .select({ id: doorStyles.id, styleCode: doorStyles.styleCode })
  .from(doorStyles)
  .where(eq(doorStyles.distributorId, DISTRIBUTOR_ID));
const styleMap = new Map(styles.map(s => [s.styleCode, s.id]));
console.log(`Skyline styles in DB: ${[...styleMap.entries()].map(([k, v]) => `${k}=${v}`).join(", ")}`);

const cabs = await db.select({ id: cabinets.id, masterCode: cabinets.masterCode }).from(cabinets);
const cabMap = new Map(cabs.map(c => [c.masterCode.toUpperCase(), c.id]));

let inserted = 0, skipped = 0;
const unmatched: string[] = [];

for (const rec of records) {
  // Resolve masterCode
  const aliasCode = ALIAS[rec.item_code] || ALIAS[rec.base_sku];
  const masterCode = (aliasCode || rec.base_sku || rec.item_code).toUpperCase();
  const cabinetId = cabMap.get(masterCode);
  if (!cabinetId) {
    unmatched.push(`${rec.item_code}/${rec.base_sku}`);
    skipped++;
    continue;
  }

  const styleId = styleMap.get(rec.style_code);
  if (!styleId) {
    console.log(`  Style not found: ${rec.style_code}`);
    skipped++;
    continue;
  }

  // Skip if already exists
  const existing = await db
    .select({ id: distributorSkus.id })
    .from(distributorSkus)
    .where(
      and(
        eq(distributorSkus.distributorId, DISTRIBUTOR_ID),
        eq(distributorSkus.cabinetId, cabinetId),
        eq(distributorSkus.styleId, styleId),
      )
    )
    .limit(1);

  if (existing.length > 0) {
    skipped++;
    continue;
  }

    await db.insert(distributorSkus).values({
      distributorId: DISTRIBUTOR_ID,
      cabinetId,
      styleId,
      sku: rec.style_sku,
      platformSku: rec.style_sku,
      distributorSku: rec.style_sku,
      wholesalePrice: rec.our_price,
      adjustedListPrice: rec.adj_list_price ?? rec.our_price,
      isAvailable: true,
      isPublished: true,
    });
  inserted++;
}

console.log(`\nDone: ${inserted} inserted, ${skipped} skipped`);
if (unmatched.length > 0) {
  const unique = [...new Set(unmatched)];
  console.log(`Unmatched item codes (${unique.length}): ${unique.slice(0, 30).join(", ")}`);
}
process.exit(0);
