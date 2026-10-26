/**
 * Create missing cabinet records for Skyline corner cabinets that don't exist in the DB,
 * then re-run the Skyline corner SKU import for those specific codes.
 *
 * Run from project root:
 *   npx tsx scripts/create_missing_skyline_cabs.mts
 */
import { drizzle } from "drizzle-orm/mysql2";
import { eq, and, inArray } from "drizzle-orm";
import { cabinets, distributorSkus, doorStyles } from "../drizzle/schema";
import { execSync } from "child_process";

const DISTRIBUTOR_ID = 3;
const SPREADSHEET_ID = "1yb-2tU3SjO1G26G0h9D10-gSwFqEZilUUtg4Xtym8ek";

const STYLE_COLS: Record<string, number> = {
  SW: 7, GR: 10, SE: 13, NB: 16, AG: 19, IB: 22, SA: 25, LG: 28, SB: 31, TC: 34,
};

// Missing cabinet records to create
const MISSING_CABS = [
  // Corner Sink Base 36"
  { masterCode: "CSB36", category: "Base", subCategory: "Corner Sink Base", placement: "base",
    width: 36, height: 34.5, depth: 24, isCorner: 1, graphicType: "door-2", minPull: 0, maxPull: 0,
    description: "Corner Sink Base Cabinet 36\"W x 34-1/2\"H x 24\"D" },
  // 27" Diagonal Corner Wall cabinets
  { masterCode: "DCW2712GD", category: "Wall", subCategory: "Diagonal Corner Wall", placement: "wall",
    width: 27, height: 12, depth: 12, isCorner: 1, graphicType: "door-1-glass", minPull: 0, maxPull: 0,
    description: "Wall Diagonal Glass Door Corner Cabinet 27\"W x 12\"H x 12\"D" },
  { masterCode: "DCW2736", category: "Wall", subCategory: "Diagonal Corner Wall", placement: "wall",
    width: 27, height: 36, depth: 12, isCorner: 1, graphicType: "door-1", minPull: 0, maxPull: 0,
    description: "Wall Diagonal Corner Cabinet 27\"W x 36\"H x 12\"D" },
  { masterCode: "DCW2742", category: "Wall", subCategory: "Diagonal Corner Wall", placement: "wall",
    width: 27, height: 42, depth: 12, isCorner: 1, graphicType: "door-1", minPull: 0, maxPull: 0,
    description: "Wall Diagonal Corner Cabinet 27\"W x 42\"H x 12\"D" },
  // 24" Blind Corner Wall cabinets
  { masterCode: "WBC2430", category: "Wall", subCategory: "Blind Corner Wall", placement: "wall",
    width: 24, height: 30, depth: 12, isCorner: 1, graphicType: "door-1", minPull: 3, maxPull: 9,
    description: "Wall Blind Corner Cabinet 24\"W x 30\"H x 12\"D" },
  { masterCode: "WBC2442", category: "Wall", subCategory: "Blind Corner Wall", placement: "wall",
    width: 24, height: 42, depth: 12, isCorner: 1, graphicType: "door-1", minPull: 3, maxPull: 9,
    description: "Wall Blind Corner Cabinet 24\"W x 42\"H x 12\"D" },
  // 36" Blind Corner Wall cabinets
  { masterCode: "WBC3630", category: "Wall", subCategory: "Blind Corner Wall", placement: "wall",
    width: 36, height: 30, depth: 12, isCorner: 1, graphicType: "door-1", minPull: 3, maxPull: 9,
    description: "Wall Blind Corner Cabinet 36\"W x 30\"H x 12\"D" },
  { masterCode: "WBC3642", category: "Wall", subCategory: "Blind Corner Wall", placement: "wall",
    width: 36, height: 42, depth: 12, isCorner: 1, graphicType: "door-1", minPull: 3, maxPull: 9,
    description: "Wall Blind Corner Cabinet 36\"W x 42\"H x 12\"D" },
];

const db = drizzle(process.env.DATABASE_URL!);

// ── 1. Create missing cabinet records ────────────────────────────────────────
console.log("Creating missing cabinet records...");
for (const cab of MISSING_CABS) {
  const existing = await db.select({ id: cabinets.id })
    .from(cabinets)
    .where(eq(cabinets.masterCode, cab.masterCode))
    .limit(1);
  if (existing.length > 0) {
    console.log(`  Already exists: ${cab.masterCode}`);
    continue;
  }
  await db.insert(cabinets).values({
    masterCode: cab.masterCode,
    category: cab.category,
    subCategory: cab.subCategory,
    placementType: cab.placement,
    width: cab.width,
    height: cab.height,
    depth: cab.depth,
    isCornerCabinet: cab.isCorner,
    graphicType: cab.graphicType,
    minPull: cab.minPull,
    maxPull: cab.maxPull,
    description: cab.description,
    showInDesigner: true,
    isActive: true,
  } as any);
  console.log(`  Created: ${cab.masterCode}`);
}

// ── 2. Re-fetch all cabinets ──────────────────────────────────────────────────
const cabs = await db.select({ id: cabinets.id, masterCode: cabinets.masterCode }).from(cabinets);
const cabMap = new Map(cabs.map(c => [c.masterCode.toUpperCase(), c.id]));

// ── 3. Get Skyline styles ─────────────────────────────────────────────────────
const styles = await db.select({ id: doorStyles.id, styleCode: doorStyles.styleCode })
  .from(doorStyles)
  .where(eq(doorStyles.distributorId, DISTRIBUTOR_ID));
const styleMap = new Map(styles.map(s => [s.styleCode, s.id]));

// ── 4. Fetch sheet data ───────────────────────────────────────────────────────
console.log("\nFetching Skyline sheet...");
const gwsOut = execSync(
  `gws sheets spreadsheets values get --params '${JSON.stringify({
    spreadsheetId: SPREADSHEET_ID,
    range: "Skyline!A1:AJ500",
  })}'`,
  { encoding: "utf8" }
);
const sheetData = JSON.parse(gwsOut) as { values: string[][] };
const rows = sheetData.values ?? [];

// ── 5. Import SKUs for the newly created cabinets ────────────────────────────
const ALIAS: Record<string, string> = {
  "CSB-36": "CSB36",
  "DCW27-12GD": "DCW2712GD", "DCW27-36": "DCW2736", "DCW27-42": "DCW2742",
  "WBC24-30": "WBC2430", "WBC24-42": "WBC2442",
  "WBC36-30": "WBC3630", "WBC36-42": "WBC3642",
};
const TARGET_CODES = new Set(MISSING_CABS.map(c => c.masterCode.toUpperCase()));

let inserted = 0, skipped = 0;

for (const row of rows.slice(1)) {
  if (!row.length) continue;
  const item_code = (row[3] || "").trim();
  const base_sku = (row[4] || "").trim();
  const aliasCode = ALIAS[item_code] || ALIAS[base_sku];
  const masterCode = (aliasCode || base_sku || item_code).toUpperCase();
  if (!TARGET_CODES.has(masterCode)) continue;

  const cabinetId = cabMap.get(masterCode);
  if (!cabinetId) { skipped++; continue; }

  for (const [style_code, col] of Object.entries(STYLE_COLS)) {
    const styleId = styleMap.get(style_code);
    if (!styleId) continue;

    // Price is in col+1, adj list in col+2
    const priceVal = (row[col + 1] || "").replace(/[$,]/g, "").trim();
    const adjVal = (row[col + 2] || "").replace(/[$,]/g, "").trim();
    const price = parseFloat(priceVal);
    if (!(price > 0)) continue;
    const adjList = parseFloat(adjVal) > 0 ? parseFloat(adjVal).toFixed(2) : price.toFixed(2);

    const existing = await db.select({ id: distributorSkus.id })
      .from(distributorSkus)
      .where(and(
        eq(distributorSkus.distributorId, DISTRIBUTOR_ID),
        eq(distributorSkus.cabinetId, cabinetId),
        eq(distributorSkus.styleId, styleId),
      ))
      .limit(1);
    if (existing.length > 0) { skipped++; continue; }

    await db.insert(distributorSkus).values({
      distributorId: DISTRIBUTOR_ID,
      cabinetId,
      styleId,
      sku: base_sku,
      platformSku: base_sku,
      distributorSku: base_sku,
      wholesalePrice: price.toFixed(2),
      adjustedListPrice: adjList,
      isAvailable: true,
      isPublished: true,
    });
    inserted++;
  }
}

console.log(`\nDone: ${inserted} inserted, ${skipped} skipped`);
process.exit(0);
