/*
 * AEF / U.S. Cabinet Depot Frameless filler-stock importer.
 *
 * Scope is intentionally limited to source-documented cuttable filler stock:
 * AF3006 and the 3 in / 6 in OF overlay filler families.
 * End panels (BEP/WEP/TEP) are deliberately excluded.
 *
 * Review: pnpm exec tsx scripts/import-aef-frameless-fillers.ts
 * Apply:  pnpm exec tsx scripts/import-aef-frameless-fillers.ts --apply
 */
import mysql from "mysql2/promise";

type FillerSource = {
  sku: string;
  description: string;
  width: number;
  height: number;
  depth: number;
  nominalWidth: 3 | 6 | 29.875;
  kind: "appliance" | "overlay";
  sourcePage: "54" | "55";
  prices: readonly [string, string, string, string, string, string, string];
};

type StyleRow = { id: number; styleCode: string };
type MasterRow = { id: number; masterCode: string; nonAefSkuCount: number };

const APPLY = process.argv.includes("--apply");
/** Product-only studio renders, never documentation, price grids, or source pages. */
export const AEF_FILLER_PRODUCT_IMAGES = {
  applianceThreePack: "/manus-storage/aef-appliance-filler-three-pack_50708d9c.webp",
  overlayThreeInch: "/manus-storage/aef-overlay-filler-3in_c10f1cc9.webp",
  overlaySixInch: "/manus-storage/aef-overlay-filler-6in_1b42acbe.webp",
} as const;
const SOURCE_REFERENCE = "US Cabinet Depot Specification Manual V8.2, Panels & Fillers, pp. 54–55";

/** Maps the seven printed price columns to the published AEF finish records. */
const STYLE_COLUMN: Record<string, number> = {
  TWP: 0, TGW: 0, TDW: 0,
  PGW: 1,
  SSA: 2, SSD: 2, SSE: 2, SSH: 2, SSJ: 2, SSK: 2, SSL: 2, SSM: 2, SSN: 2, SSO: 2, SSP: 2, SSQ: 2, SSR: 2, SSS: 2, SSV: 2, SSX: 2, SSZ: 2,
  LSA: 3, LSC: 3, LSN: 3,
  ZSA: 3, ZSB: 3, ZSC: 3, ZSI: 3, ZSK: 3, ZSL: 3, ZSM: 3, ZSN: 3, ZSO: 3, ZSP: 3, ZSU: 3, ZSV: 3, ZSW: 3,
  LSP: 4, LSR: 4,
  SCA: 5, SCL: 5, SCM: 5, SCN: 5, SCQ: 5, SCR: 5, SCZ: 5,
  ZCC: 6, ZCK: 6, ZCN: 6,
};

// Exact source dimensions: product specifications V8.2 p. 54 (3 in) / p. 55 (6 in).
// Exact list-price columns: user-provided current AEF Panels & Fillers price grid.
const FILLERS: readonly FillerSource[] = [
  { sku: "AF3006", description: 'Appliance Filler (three-pack) — 29-7/8" W × 5-7/8" H × 3/4" D', width: 29.875, height: 5.875, depth: 0.75, nominalWidth: 29.875, kind: "appliance", sourcePage: "54", prices: ["56", "186", "60", "80", "80", "140", "155"] },
  { sku: "OF323", description: '3" Filler Overlay — 2-7/8" W × 22-1/2" H × 3/4" D', width: 2.875, height: 22.5, depth: 0.75, nominalWidth: 3, kind: "overlay", sourcePage: "54", prices: ["23", "34", "36", "41", "41", "61", "71"] },
  { sku: "OF330", description: '3" Filler Overlay — 2-7/8" W × 30-1/8" H × 3/4" D', width: 2.875, height: 30.125, depth: 0.75, nominalWidth: 3, kind: "overlay", sourcePage: "54", prices: ["27", "44", "44", "54", "54", "84", "89"] },
  { sku: "OF335", description: '3" Filler Overlay — 2-7/8" W × 35-1/8" H × 3/4" D', width: 2.875, height: 35.125, depth: 0.75, nominalWidth: 3, kind: "overlay", sourcePage: "54", prices: ["35", "53", "53", "63", "68", "98", "108"] },
  { sku: "OF340", description: '3" Filler Overlay — 2-7/8" W × 40-1/8" H × 3/4" D', width: 2.875, height: 40.125, depth: 0.75, nominalWidth: 3, kind: "overlay", sourcePage: "54", prices: ["40", "60", "60", "70", "75", "110", "120"] },
  { sku: "OF384", description: '3" Filler Overlay — 2-7/8" W × 83-3/4" H × 3/4" D', width: 2.875, height: 83.75, depth: 0.75, nominalWidth: 3, kind: "overlay", sourcePage: "54", prices: ["77", "122", "118", "143", "148", "223", "248"] },
  { sku: "OF389", description: '3" Filler Overlay — 2-7/8" W × 88-3/4" H × 3/4" D', width: 2.875, height: 88.75, depth: 0.75, nominalWidth: 3, kind: "overlay", sourcePage: "54", prices: ["83", "130", "122", "157", "157", "242", "267"] },
  { sku: "OF394", description: '3" Filler Overlay — 2-7/8" W × 93-3/4" H × 3/4" D', width: 2.875, height: 93.75, depth: 0.75, nominalWidth: 3, kind: "overlay", sourcePage: "54", prices: ["87", "136", "129", "164", "169", "254", "279"] },
  { sku: "OF630", description: '6" Filler Overlay — 5-7/8" W × 30-1/8" H × 3/4" D', width: 5.875, height: 30.125, depth: 0.75, nominalWidth: 6, kind: "overlay", sourcePage: "55", prices: ["58", "89", "89", "109", "109", "169", "184"] },
  { sku: "OF635", description: '6" Filler Overlay — 5-7/8" W × 35-1/8" H × 3/4" D', width: 5.875, height: 35.125, depth: 0.75, nominalWidth: 6, kind: "overlay", sourcePage: "55", prices: ["67", "104", "98", "123", "128", "193", "213"] },
  { sku: "OF640", description: '6" Filler Overlay — 5-7/8" W × 40-1/8" H × 3/4" D', width: 5.875, height: 40.125, depth: 0.75, nominalWidth: 6, kind: "overlay", sourcePage: "55", prices: ["73", "119", "111", "141", "146", "221", "246"] },
  { sku: "OF684", description: '6" Filler Overlay — 5-7/8" W × 83-3/4" H × 3/4" D', width: 5.875, height: 83.75, depth: 0.75, nominalWidth: 6, kind: "overlay", sourcePage: "55", prices: ["154", "245", "232", "292", "302", "457", "507"] },
  { sku: "OF689", description: '6" Filler Overlay — 5-7/8" W × 88-3/4" H × 3/4" D', width: 5.875, height: 88.75, depth: 0.75, nominalWidth: 6, kind: "overlay", sourcePage: "55", prices: ["162", "260", "246", "311", "321", "486", "536"] },
  { sku: "OF694", description: '6" Filler Overlay — 5-7/8" W × 93-3/4" H × 3/4" D', width: 5.875, height: 93.75, depth: 0.75, nominalWidth: 6, kind: "overlay", sourcePage: "55", prices: ["173", "275", "261", "326", "336", "516", "566"] },
] as const;

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function sourcePrice(value: string): number {
  const parsed = Number(value.replace(/[$,]/g, "").trim());
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Invalid printed filler price: ${JSON.stringify(value)}`);
  return parsed;
}

function landedCost(listPrice: number): number {
  // Approved USCD cost basis: printed source list × 23%, plus 7% freight.
  return round2(round2(listPrice * 0.23) * 1.07);
}

function listPriceFor(source: FillerSource, styleCode: string): number {
  const column = STYLE_COLUMN[styleCode];
  if (column === undefined) throw new Error(`No AEF price-column mapping for ${styleCode}`);
  return sourcePrice(source.prices[column]!);
}

function fillerProductImage(source: FillerSource): string {
  if (source.kind === "appliance") return AEF_FILLER_PRODUCT_IMAGES.applianceThreePack;
  if (source.nominalWidth === 3) return AEF_FILLER_PRODUCT_IMAGES.overlayThreeInch;
  if (source.nominalWidth === 6) return AEF_FILLER_PRODUCT_IMAGES.overlaySixInch;
  throw new Error(`No clean product image mapping for ${source.sku}`);
}

function fillerConfig(source: FillerSource): Record<string, unknown> {
  return {
    description: source.description,
    category: "Accessory",
    subCategory: "Filler",
    width: source.width.toFixed(3),
    height: source.height.toFixed(3),
    depth: source.depth.toFixed(3),
    physicalWidth: source.width.toFixed(3),
    graphicType: "accessory",
    isNotCabinet: true,
    sourceFillerStock: true,
    nominalFillerWidth: source.nominalWidth,
    fillerKind: source.kind,
    layoutSpec: `${source.description}; ${SOURCE_REFERENCE}, p. ${source.sourcePage}.`,
    specImageUrl: fillerProductImage(source),
    specNotes: `Source-documented AEF frameless cuttable filler stock; printed dimensions; ${SOURCE_REFERENCE}, p. ${source.sourcePage}.`,
  };
}

async function main() {
  if (FILLERS.length !== 14 || new Set(FILLERS.map((item) => item.sku)).size !== FILLERS.length) {
    throw new Error("Expected exactly fourteen unique AEF filler source records");
  }
  for (const source of FILLERS) {
    if (source.prices.length !== 7 || source.prices.some((price) => !Number.isFinite(sourcePrice(price)))) {
      throw new Error(`Invalid seven-column price grid for ${source.sku}`);
    }
  }

  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  try {
    const [[aef]]: any = await conn.query("SELECT id,code,baseMultiplier,freightMultiplier FROM distributors WHERE code='AEF' LIMIT 1");
    const [[pricing]]: any = await conn.query("SELECT homeownerMarkupBps,contractorMarkupBps,wholesaleMarkupBps FROM pricing_settings ORDER BY id LIMIT 1");
    if (!aef || !pricing) throw new Error("AEF supplier or platform pricing settings are missing");
    if (Number(aef.baseMultiplier) !== 0.23 || Number(aef.freightMultiplier) !== 0.07) throw new Error("AEF multiplier contract changed; refusing filler import");
    if (Number(pricing.homeownerMarkupBps) !== 15800 || Number(pricing.contractorMarkupBps) !== 12900 || Number(pricing.wholesaleMarkupBps) !== 12500) throw new Error("Platform tier contract changed; refusing filler import");

    const [stylesRaw]: any = await conn.query("SELECT id,styleCode FROM door_styles WHERE distributorId=? AND isActive=1 ORDER BY styleCode", [aef.id]);
    const styles = stylesRaw as StyleRow[];
    if (styles.length !== 49 || styles.some((style) => STYLE_COLUMN[style.styleCode] === undefined)) throw new Error("AEF must have all 49 mapped active finish styles");

    const codes = FILLERS.map((item) => item.sku);
    const [existingRaw]: any = await conn.query(
      `SELECT c.id,c.masterCode,SUM(CASE WHEN ds.distributorId IS NOT NULL AND ds.distributorId <> ? THEN 1 ELSE 0 END) AS nonAefSkuCount
       FROM cabinets c LEFT JOIN distributor_skus ds ON ds.cabinetId=c.id
       WHERE c.masterCode IN (${codes.map(() => "?").join(",")})
       GROUP BY c.id,c.masterCode`,
      [aef.id, ...codes],
    );
    const masters = new Map<string, MasterRow>((existingRaw as MasterRow[]).map((row) => [row.masterCode, row]));
    const collisions = Array.from(masters.values()).filter((row) => Number(row.nonAefSkuCount) > 0);
    if (collisions.length) throw new Error(`Refusing to modify a shared filler master: ${collisions.map((row) => row.masterCode).join(", ")}`);

    const expectedSkuRows = FILLERS.length * styles.length;
    const preview = FILLERS.map((source) => ({
      sku: source.sku,
      printedSize: `${source.width}" W × ${source.height}" H × ${source.depth}" D`,
      sourcePage: source.sourcePage,
      listByColumn: source.prices,
      exampleLspList: listPriceFor(source, "LSP"),
      exampleLspHomeowner: round2(landedCost(listPriceFor(source, "LSP")) * 1.58),
    }));
    console.log(JSON.stringify({ mode: APPLY ? "apply" : "preflight", source: SOURCE_REFERENCE, fillerMasters: FILLERS.length, expectedSourceSkuRows: expectedSkuRows, preview }, null, 2));
    if (!APPLY) return;

    await conn.beginTransaction();
    try {
      for (const source of FILLERS) {
        let master = masters.get(source.sku);
        const productImage = fillerProductImage(source);
        if (!master) {
          const [insert]: any = await conn.query(
            `INSERT INTO cabinets (masterCode,description,descriptionSource,category,subCategory,width,height,depth,physicalWidth,placementType,numberOfDoors,numberOfDrawers,isCornerCabinet,graphicType,isActive,showInCatalog,showInDesigner,showIn2020,isNotCabinet,layoutSpec,specImageUrl,specNotes,productType,configVerified,configVerifiedByName)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [source.sku, source.description, "manufacturer_spec", "Accessory", "Filler", source.width.toFixed(3), source.height.toFixed(3), source.depth.toFixed(3), source.width.toFixed(3), "accessory", 0, 0, false, "accessory", true, true, true, true, true, `${source.description}; ${SOURCE_REFERENCE}, p. ${source.sourcePage}.`, productImage, `Exact source-only AEF filler stock. Shared cabinet geometry is not used.`, "accessory", true, "AEF V8.2 filler import"],
          );
          master = { id: Number(insert.insertId), masterCode: source.sku, nonAefSkuCount: 0 };
          masters.set(source.sku, master);
        }

        // The collision guard above proves this source filler master is AEF-only.
        await conn.query("UPDATE cabinets SET specImageUrl = ? WHERE id = ?", [productImage, master.id]);

        const configJson = JSON.stringify(fillerConfig(source));
        await conn.query(
          `INSERT INTO distributor_cabinet_overrides (distributorId,cabinetId,width,height,depth,physicalWidth,imageUrl,configJson,note)
           VALUES (?,?,?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE width=VALUES(width),height=VALUES(height),depth=VALUES(depth),physicalWidth=VALUES(physicalWidth),imageUrl=VALUES(imageUrl),configJson=VALUES(configJson),note=VALUES(note)`,
          [aef.id, master.id, source.width.toFixed(3), source.height.toFixed(3), source.depth.toFixed(3), source.width.toFixed(3), productImage, configJson, `AEF source-only cuttable filler stock — V8.2 p. ${source.sourcePage}; no shared-master modification.`],
        );

        for (const style of styles) {
          const list = listPriceFor(source, style.styleCode);
          const cost = landedCost(list);
          await conn.query(
            `INSERT INTO distributor_skus (cabinetId,distributorId,styleId,platformSku,distributorSku,listPrice,yourCost,adjustedListPrice,wholesalePrice,contractorPrice,homeownerPrice,isAvailable,isPublished,imageUrl,supplierCabinetName,supplierDescription,status,constructionType,geometryWidth,geometryHeight,geometryDepth,geometrySourcePage,geometryStatus)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
             ON DUPLICATE KEY UPDATE cabinetId=VALUES(cabinetId),platformSku=VALUES(platformSku),distributorSku=VALUES(distributorSku),listPrice=VALUES(listPrice),yourCost=VALUES(yourCost),adjustedListPrice=VALUES(adjustedListPrice),wholesalePrice=VALUES(wholesalePrice),contractorPrice=VALUES(contractorPrice),homeownerPrice=VALUES(homeownerPrice),isAvailable=1,isPublished=1,imageUrl=VALUES(imageUrl),supplierCabinetName=VALUES(supplierCabinetName),supplierDescription=VALUES(supplierDescription),status='approved',constructionType='frameless',geometryWidth=VALUES(geometryWidth),geometryHeight=VALUES(geometryHeight),geometryDepth=VALUES(geometryDepth),geometrySourcePage=VALUES(geometrySourcePage),geometryStatus='verified'`,
            [master.id, aef.id, style.id, `AEF-${source.sku}-${style.styleCode}`, source.sku, list.toFixed(2), cost.toFixed(2), cost.toFixed(2), round2(cost * 1.25).toFixed(2), round2(cost * 1.29).toFixed(2), round2(cost * 1.58).toFixed(2), true, true, productImage, source.sku, source.description, "approved", "frameless", source.width.toFixed(3), source.height.toFixed(3), source.depth.toFixed(3), `${SOURCE_REFERENCE}, p. ${source.sourcePage}`, "verified"],
          );
        }
      }
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    }
  } finally {
    await conn.end();
  }
}

if (process.argv[1]?.endsWith("import-aef-frameless-fillers.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
