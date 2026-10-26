/*
 * Complete AltaEuro / U.S. Cabinet Depot Frameless source-line importer.
 *
 * Scope:
 * - AEF distributor records only (US Cabinet Depot Frameless);
 * - source-backed V8.2 geometry, face layout, finish pricing and images;
 * - distributor-specific overrides for shared masters.
 *
 * It never changes a shared master’s geometry or image. New masters are created
 * only when the exact source master code does not already exist. "X" source
 * prices are intentionally not created as sellable SKU rows.
 *
 * Review before applying:
 *   pnpm exec tsx scripts/expand-aef-uscd-frameless.ts
 * Apply transactionally:
 *   pnpm exec tsx scripts/expand-aef-uscd-frameless.ts --apply
 */
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
import { AEF_EXPANDED_SOURCE_GEOMETRY } from "../shared/aefFramelessExpandedGeometry";

type SourceConfig = {
  cabinet?: boolean;
  doors?: number;
  drawers?: number;
  graphic?: string;
  productType?: string;
  placement?: "accessory";
  isNotCabinet?: boolean;
  isCorner?: boolean;
  cornerType?: "blind-corner" | "l-shape";
  doorOrientation?: "side-by-side" | "stacked";
  openingType?: "top" | "middle" | "bottom";
  ovenType?: "single" | "double";
  /** Explicit exterior drawer rows for a source-configured oven cabinet. */
  drawerLayout?: Array<{ count: number; height?: number }>;
  /** Allows a verified AEF exterior drawer layout to replace generic oven defaults. */
  sourceOvenDrawerLayout?: boolean;
};

type SourceRow = {
  sku: string;
  category: "Base" | "Wall" | "Tall" | "Vanity" | "Accessory";
  description: string;
  width?: number;
  height?: number;
  depth?: number;
  toeKickHeight?: number | null;
  weightLb: number;
  priceCount: number;
  prices: string[];
  sourcePage: number;
  configuration: SourceConfig;
};

type StyleRow = { id: number; styleCode: string };
type MasterRow = {
  id: number;
  masterCode: string;
  isActive: number;
  showInCatalog: number;
  showInDesigner: number;
  nonAefSkuCount: number;
};

const APPLY = process.argv.includes("--apply");
const ROOT = process.cwd();
const MANIFEST_PATH = path.join(ROOT, "scripts/data/aef-complete-source-manifest.json");
const IMAGES = {
  // Catalog art must be product imagery, never a source chart or price grid.
  accessoryFinish: "/manus-storage/aef-accessory-moulding-render_fbee12a3.webp",
  accessoryMoulding: "/manus-storage/aef-accessory-moulding_56f3c613.png",
  accessoryPanel: "/manus-storage/aef-accessory-panel-render_252d1d1a.webp",
  accessoryEdgeBanding: "/manus-storage/frameless-edge-banding-roll_fd907129.webp",
  base2drawer: "/manus-storage/aef-base-2drawer_a8a40175.png",
  base3drawer: "/manus-storage/aef-base-3drawer_e6f7a40c.png",
  baseBlind: "/manus-storage/aef-base-blind-corner_0213de3e.png",
  baseFarmRange: "/manus-storage/aef-base-farm-range_f44d2635.png",
  baseMicrowave: "/manus-storage/aef-base-microwave_a1153228.png",
  basePullout: "/manus-storage/aef-base-specialty-pullout_2a2b4c19.png",
  tall2drawer: "/manus-storage/aef-tall-2drawer_e21847c4.png",
  tall3drawer: "/manus-storage/aef-tall-3drawer_dd9e92c8.png",
  tallOven: "/manus-storage/aef-tall-oven_e94be0da.png",
  vanity2drawer: "/manus-storage/aef-vanity-2drawer_d0dbb877.png",
  vanity3drawer: "/manus-storage/aef-vanity-3drawer_a3439e3a.png",
  vanityKnee: "/manus-storage/aef-vanity-knee-drawer_02574157.png",
  vanityTall: "/manus-storage/aef-vanity-tall-drawer_4efe8444.png",
  wallBlind: "/manus-storage/aef-wall-blind-corner_8024a66e.png",
  wallFlipUp: "/manus-storage/aef-wall-flipup_9b574b63.png",
} as const;

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

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function printedDimension(value: number | null | undefined): string | null {
  return value == null ? null : value.toFixed(3);
}

function landedCost(listPrice: number): number {
  // The approved USCD rule is source list × 23%, rounded, then 7% freight.
  return round2(round2(listPrice * 0.23) * 1.07);
}

function sourcePrice(value: string): number {
  const normalized = value.replace(/[$,]/g, "").trim();
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Invalid source price ${JSON.stringify(value)}`);
  return parsed;
}

function placementFor(row: SourceRow): "base" | "wall" | "tall" | "accessory" {
  if (row.configuration.placement === "accessory" || row.category === "Accessory") return "accessory";
  if (row.category === "Wall") return "wall";
  if (row.category === "Tall") return "tall";
  return "base";
}

/** Source-priced but intentionally selectable only from Refrigerator Options. */
function refrigeratorOnlyPanel(row: SourceRow): boolean {
  return row.sku === "TEP3096";
}

function subCategoryFor(row: SourceRow): string | null {
  if (row.category === "Accessory") {
    if (row.sku === "TEP3096") return "Refrigerator End Panel";
    if (row.sku === "BEP2535") return "Base End Panel";
    if (/^WEP\d+$/i.test(row.sku)) return "Wall End Panel";
    return row.sku === "OCM8" || row.sku === "BM8" || row.sku === "SM8" || row.sku === "TKC" || row.sku.includes("PVC") ? "Molding" : "Accessory";
  }
  if (row.configuration.cornerType === "blind-corner") return row.category === "Wall" ? "Blind Corner Wall" : "Blind Corner Base";
  if (row.configuration.cornerType === "l-shape") return "Lazy Susan Corner";
  if (row.sku.startsWith("WFD")) return "Flip-Up Wall";
  if (row.sku.startsWith("TOS") || row.sku.startsWith("TOD")) return "Oven Cabinet";
  return null;
}

function imageFor(row: SourceRow): string {
  const code = row.sku;
  if (row.category === "Accessory") {
    if (code === "EB10") return IMAGES.accessoryEdgeBanding;
    if (code === "TEP3096") return IMAGES.accessoryPanel;
    if (code === "BEP2535" || /^WEP\d+$/i.test(code)) return IMAGES.accessoryPanel;
    return code === "OCM8" || code === "BM8" || code === "SM8" || code === "TKC" || code.includes("PVC") ? IMAGES.accessoryMoulding : IMAGES.accessoryFinish;
  }
  if (code.startsWith("WFD")) return IMAGES.wallFlipUp;
  if (code.startsWith("WBC")) return IMAGES.wallBlind;
  if (code.startsWith("BBC")) return IMAGES.baseBlind;
  if (code.startsWith("2VDB")) return IMAGES.vanity2drawer;
  if (code.startsWith("3VDB")) return IMAGES.vanity3drawer;
  if (code.startsWith("VKD")) return IMAGES.vanityKnee;
  if (code.startsWith("VT")) return IMAGES.vanityTall;
  if (code.startsWith("TOS") || code.startsWith("TOD")) return IMAGES.tallOven;
  if (code.startsWith("T3DB")) return IMAGES.tall3drawer;
  if (code.startsWith("T2DB")) return IMAGES.tall2drawer;
  if (code.startsWith("2DB") || code.startsWith("RB2DB")) return IMAGES.base2drawer;
  if (code.startsWith("3DB") || code.startsWith("RB3DB")) return IMAGES.base3drawer;
  if (code.startsWith("FSB") || code.startsWith("LSB")) return IMAGES.baseFarmRange;
  if (code.startsWith("BMW")) return IMAGES.baseMicrowave;
  return IMAGES.basePullout;
}

/** Exact printed styles for accessories with deliberately limited availability. */
function applicableStyles(row: SourceRow, allStyles: StyleRow[]): StyleRow[] {
  if (row.priceCount === 7) return allStyles.filter((style) => STYLE_COLUMN[style.styleCode] !== undefined);
  if (row.priceCount === 2) return allStyles.filter((style) => style.styleCode === "PGW" || ["TWP", "TGW", "TDW"].includes(style.styleCode));
  if (row.priceCount === 1 && ["TKC-PVC", "CORNER-PVC"].includes(row.sku)) return allStyles.filter((style) => ["LSP", "LSR"].includes(style.styleCode));
  throw new Error(`No safe limited-availability mapping for ${row.sku} (priceCount ${row.priceCount})`);
}

function listPriceFor(row: SourceRow, styleCode: string): number {
  const column = STYLE_COLUMN[styleCode];
  if (column === undefined) throw new Error(`No printed style-column mapping for ${styleCode}`);
  if (row.priceCount === 7) return sourcePrice(row.prices[column]!);
  if (row.priceCount === 2) return sourcePrice(row.prices[column === 0 ? 0 : 1]!);
  return sourcePrice(row.prices[0]!);
}

function configFor(row: SourceRow): Record<string, unknown> {
  const geometry = AEF_EXPANDED_SOURCE_GEOMETRY[row.sku];
  const config = row.configuration;
  return {
    description: row.description,
    category: row.category,
    subCategory: subCategoryFor(row),
    ...(geometry ? {
      width: printedDimension(geometry.width),
      height: printedDimension(geometry.height),
      depth: printedDimension(geometry.depth),
      weight: String(row.weightLb),
    } : {}),
    numberOfDoors: config.doors ?? 0,
    numberOfDrawers: config.drawers ?? 0,
    doorsPerRow: (config.doors ?? 0) > 1 && config.doorOrientation !== "stacked" ? 2 : (config.doors ?? 0) > 0 ? 1 : null,
    doorOrientation: config.doorOrientation ?? ((config.doors ?? 0) > 1 ? "side-by-side" : null),
    graphicType: config.graphic ?? "accessory",
    isCornerCabinet: config.isCorner ?? false,
    cornerType: config.cornerType ?? null,
    openingType: config.openingType ?? null,
    ...(config.ovenType ? { ovenType: config.ovenType } : {}),
    ...(config.drawerLayout ? { drawerLayout: JSON.stringify(config.drawerLayout) } : {}),
    ...(config.sourceOvenDrawerLayout ? { sourceOvenDrawerLayout: true } : {}),
    layoutSpec: `${row.description}; AltaEuro / U.S. Cabinet Depot Frameless Collection Full Spec Book V8.2, p. ${row.sourcePage}.`,
    specImageUrl: imageFor(row),
    specNotes: `Printed V8.2 source geometry and face layout. ${geometry ? `${geometry.width}\" W × ${geometry.height}\" H × ${geometry.depth}\" D; ` : ""}source p. ${row.sourcePage}.`,
  };
}

function masterValues(row: SourceRow): unknown[] {
  const c = row.configuration;
  const geometry = AEF_EXPANDED_SOURCE_GEOMETRY[row.sku];
  const isAccessory = row.category === "Accessory";
  const refrigeratorOnly = refrigeratorOnlyPanel(row);
  return [
    row.sku, row.description, "manufacturer_spec", row.category, subCategoryFor(row),
    printedDimension(geometry?.width), printedDimension(geometry?.height), printedDimension(geometry?.depth),
    printedDimension(geometry?.width), row.weightLb.toFixed(2), placementFor(row),
    c.doors ?? 0, c.drawers ?? 0, geometry?.toeKickHeight?.toFixed(2) ?? null,
    Boolean(c.isCorner), c.cornerType === "blind-corner" ? "3.00" : null, c.cornerType === "blind-corner" ? "6.00" : null,
    c.graphic ?? "accessory", true, !refrigeratorOnly, !refrigeratorOnly, !refrigeratorOnly, row.weightLb.toFixed(2), Boolean(isAccessory || c.isNotCabinet),
    c.cornerType ?? null, c.doorOrientation ?? null,
    `${row.description}; source: AltaEuro / U.S. Cabinet Depot Frameless Collection Full Spec Book V8.2 p. ${row.sourcePage}.`, imageFor(row),
    `Exact distributor source configuration; shared-master geometry is never used for the AEF line.`,
    (c.doors ?? 0) > 1 && c.doorOrientation !== "stacked" ? 2 : (c.doors ?? 0) || null,
    c.openingType ?? null, c.productType ?? (isAccessory ? "accessory" : "standard"), true, "AltaEuro V8.2 complete-line import",
  ];
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")) as SourceRow[];
  if (manifest.length !== 168) throw new Error(`Expected 168 expanded source records; found ${manifest.length}`);
  if (new Set(manifest.map((row) => row.sku)).size !== manifest.length) throw new Error("Manifest contains duplicate source SKUs");
  const geometryRows = manifest.filter((row) => row.width !== undefined);
  if (geometryRows.length !== 157 || Object.keys(AEF_EXPANDED_SOURCE_GEOMETRY).length !== 157) throw new Error("Expanded source geometry table must contain all 157 source-verified items");
  for (const row of geometryRows) {
    const geometry = AEF_EXPANDED_SOURCE_GEOMETRY[row.sku];
    if (!geometry || geometry.width !== row.width || geometry.height !== row.height || geometry.depth !== row.depth || geometry.sourcePage !== String(row.sourcePage)) {
      throw new Error(`Geometry manifest does not match resolver for ${row.sku}`);
    }
  }

  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  try {
    const [[aef]]: any = await conn.query("SELECT * FROM distributors WHERE code='AEF' LIMIT 1");
    const [[uscd]]: any = await conn.query("SELECT * FROM distributors WHERE code='USCD' LIMIT 1");
    const [[pricing]]: any = await conn.query("SELECT * FROM pricing_settings ORDER BY id LIMIT 1");
    if (!aef || !uscd || !pricing) throw new Error("AEF, USCD or pricing settings missing");
    if (Number(uscd.baseMultiplier) !== 0.23 || Number(uscd.freightMultiplier) !== 0.07 || Number(aef.baseMultiplier) !== 0.23 || Number(aef.freightMultiplier) !== 0.07) throw new Error("USCD 23% plus 7% multiplier validation failed");
    if (Number(pricing.homeownerMarkupBps) !== 15800 || Number(pricing.contractorMarkupBps) !== 12900 || Number(pricing.wholesaleMarkupBps) !== 12500) throw new Error("Current tier markups do not match the release contract");

    const [stylesRaw]: any = await conn.query("SELECT id,styleCode FROM door_styles WHERE distributorId=? AND isActive=1 ORDER BY styleCode", [aef.id]);
    const styles = stylesRaw as StyleRow[];
    if (styles.length !== 49 || styles.some((style) => STYLE_COLUMN[style.styleCode] === undefined)) throw new Error("AEF is missing one or more source finish styles");

    const codes = manifest.map((row) => row.sku);
    const [existingRaw]: any = await conn.query(
      `SELECT c.id,c.masterCode,c.isActive,c.showInCatalog,c.showInDesigner,SUM(CASE WHEN d.code<>'AEF' THEN 1 ELSE 0 END) AS nonAefSkuCount
       FROM cabinets c LEFT JOIN distributor_skus ds ON ds.cabinetId=c.id LEFT JOIN distributors d ON d.id=ds.distributorId
       WHERE c.masterCode IN (${codes.map(() => "?").join(",")})
       GROUP BY c.id,c.masterCode,c.isActive,c.showInCatalog,c.showInDesigner`,
      codes,
    );
    const existing = existingRaw as MasterRow[];
    const existingByCode = new Map(existing.map((row) => [row.masterCode, row]));
    for (const shared of existing.filter((row) => Number(row.nonAefSkuCount) > 0)) {
      if (!Number(shared.isActive) || !Number(shared.showInCatalog) || !Number(shared.showInDesigner)) {
        throw new Error(`Shared master ${shared.masterCode} is hidden/inactive; refusing to change another line's visibility`);
      }
    }

    const sellableRows = manifest.flatMap((row) => applicableStyles(row, styles).map((style) => ({ sku: row.sku, styleCode: style.styleCode, listPrice: listPriceFor(row, style.styleCode) })));
    const summary = {
      mode: APPLY ? "apply" : "preflight",
      source: "AltaEuro / U.S. Cabinet Depot Frameless Collection Full Spec Book V8.2",
      sourceRecords: manifest.length,
      completeCabinetModels: geometryRows.length,
      accessories: manifest.length - geometryRows.length,
      existingSharedMasters: existing.length,
      newMasters: manifest.length - existing.length,
      newSourceSkuRows: sellableRows.length,
      sourcePriceColumns: 7,
      limitedAccessoryAvailability: manifest.filter((row) => row.priceCount !== 7).map((row) => ({ sku: row.sku, printedColumns: row.priceCount })),
      exampleHomeownerPrices: sellableRows.filter((row) => ["2DB24", "WFD3015-BLUM", "TOS2DB3084"].includes(row.sku)).slice(0, 3).map((row) => ({ ...row, landedCost: landedCost(row.listPrice), homeowner: round2(landedCost(row.listPrice) * 1.58) })),
    };
    console.log(JSON.stringify(summary, null, 2));
    if (!APPLY) return;

    await conn.beginTransaction();
    try {
      // Create only genuinely new code identities. Existing master geometry and images stay untouched.
      for (const row of manifest) {
        if (existingByCode.has(row.sku)) continue;
        const values = masterValues(row);
        const [result]: any = await conn.query(
          `INSERT INTO cabinets (masterCode,description,descriptionSource,category,subCategory,width,height,depth,physicalWidth,weight,placementType,numberOfDoors,numberOfDrawers,toeKickHeight,isCornerCabinet,minPull,maxPull,graphicType,isActive,showInCatalog,showInDesigner,showIn2020,pkgWeight,isNotCabinet,corner_type,doorOrientation,layoutSpec,specImageUrl,specNotes,doorsPerRow,openingType,productType,configVerified,configVerifiedByName)
           VALUES (${values.map(() => "?").join(",")})`, values,
        );
        existingByCode.set(row.sku, { id: Number(result.insertId), masterCode: row.sku, isActive: 1, showInCatalog: 1, showInDesigner: 1, nonAefSkuCount: 0 });
      }

      // AEF-only masters can be public. TEP3096 is source-priced but appears only
      // inside Refrigerator Options, where it is cut to the installation depth.
      // Shared masters have already been asserted public and are not touched.
      const refrigeratorOnlyCodes = new Set(manifest.filter(refrigeratorOnlyPanel).map((row) => row.sku));
      const aefOnlyIds = Array.from(existingByCode.values())
        .filter((row) => !Number(row.nonAefSkuCount) && !refrigeratorOnlyCodes.has(row.masterCode))
        .map((row) => row.id);
      if (aefOnlyIds.length) await conn.query(`UPDATE cabinets SET isActive=1,showInCatalog=1,showInDesigner=1,showIn2020=1 WHERE id IN (${aefOnlyIds.map(() => "?").join(",")})`, aefOnlyIds);
      const refrigeratorOnlyIds = Array.from(existingByCode.values())
        .filter((row) => refrigeratorOnlyCodes.has(row.masterCode))
        .map((row) => row.id);
      if (refrigeratorOnlyIds.length) await conn.query(`UPDATE cabinets SET isActive=1,showInCatalog=0,showInDesigner=0,showIn2020=0 WHERE id IN (${refrigeratorOnlyIds.map(() => "?").join(",")})`, refrigeratorOnlyIds);

      // Geometry, visuals and face layouts are AEF-only overrides; never alter a framed shared master.
      for (const row of manifest) {
        const master = existingByCode.get(row.sku)!;
        const geometry = AEF_EXPANDED_SOURCE_GEOMETRY[row.sku];
        const config = configFor(row);
        await conn.query(
          `INSERT INTO distributor_cabinet_overrides (distributorId,cabinetId,width,height,depth,physicalWidth,weight,pkgWeight,imageUrl,configJson,note)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE width=VALUES(width),height=VALUES(height),depth=VALUES(depth),physicalWidth=VALUES(physicalWidth),weight=VALUES(weight),pkgWeight=VALUES(pkgWeight),imageUrl=VALUES(imageUrl),configJson=VALUES(configJson),note=VALUES(note)`,
          [aef.id, master.id, printedDimension(geometry?.width), printedDimension(geometry?.height), printedDimension(geometry?.depth), printedDimension(geometry?.width), row.weightLb.toFixed(2), row.weightLb.toFixed(2), imageFor(row), JSON.stringify(config), `AEF full-line source override — V8.2 p. ${row.sourcePage}; shared master untouched.`],
        );
      }

      for (const row of manifest) {
        const master = existingByCode.get(row.sku)!;
        const geometry = AEF_EXPANDED_SOURCE_GEOMETRY[row.sku];
        for (const style of applicableStyles(row, styles)) {
          const list = listPriceFor(row, style.styleCode);
          const cost = landedCost(list);
          const platformSku = `AEF-${row.sku}-${style.styleCode}`;
          await conn.query(
            `INSERT INTO distributor_skus (cabinetId,distributorId,styleId,platformSku,distributorSku,listPrice,yourCost,adjustedListPrice,wholesalePrice,contractorPrice,homeownerPrice,isAvailable,isPublished,imageUrl,supplierCabinetName,supplierDescription,status,pkgWeight,constructionType,geometryWidth,geometryHeight,geometryDepth,geometryToeKickHeight,geometrySourcePage,geometryStatus)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
             ON DUPLICATE KEY UPDATE platformSku=VALUES(platformSku),distributorSku=VALUES(distributorSku),listPrice=VALUES(listPrice),yourCost=VALUES(yourCost),adjustedListPrice=VALUES(adjustedListPrice),wholesalePrice=VALUES(wholesalePrice),contractorPrice=VALUES(contractorPrice),homeownerPrice=VALUES(homeownerPrice),isAvailable=1,isPublished=1,imageUrl=VALUES(imageUrl),supplierCabinetName=VALUES(supplierCabinetName),supplierDescription=VALUES(supplierDescription),status='approved',pkgWeight=VALUES(pkgWeight),constructionType='frameless',geometryWidth=VALUES(geometryWidth),geometryHeight=VALUES(geometryHeight),geometryDepth=VALUES(geometryDepth),geometryToeKickHeight=VALUES(geometryToeKickHeight),geometrySourcePage=VALUES(geometrySourcePage),geometryStatus='verified'`,
            [master.id, aef.id, style.id, platformSku, row.sku, list.toFixed(2), cost.toFixed(2), cost.toFixed(2), round2(cost * 1.25).toFixed(2), round2(cost * 1.29).toFixed(2), round2(cost * 1.58).toFixed(2), true, true, imageFor(row), row.sku, `${row.description}. AltaEuro / U.S. Cabinet Depot Frameless Collection Full Spec Book V8.2, p. ${row.sourcePage}.`, "approved", row.weightLb.toFixed(2), "frameless", printedDimension(geometry?.width), printedDimension(geometry?.height), printedDimension(geometry?.depth), geometry?.toeKickHeight?.toFixed(2) ?? null, `AltaEuro Collection Full Spec Book V8.2, p. ${row.sourcePage}`, "verified"],
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

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
