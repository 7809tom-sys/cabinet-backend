/*
 * Controlled release for the verified AltaEuro Frameless Collection.
 *
 * Scope is intentionally limited to distributor code AEF (the U.S. Cabinet Depot
 * frameless line), its door styles, its distributor SKU rows, and its
 * distributor-specific cabinet overrides. Shared `cabinets` geometry and generic
 * master images are not changed.
 *
 * Run a preflight first:
 *   pnpm exec tsx scripts/release-aef-uscd-frameless.ts
 * Apply only after reviewing the JSON preflight:
 *   pnpm exec tsx scripts/release-aef-uscd-frameless.ts --apply
 */
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
import { aefPrintedGeometryForSku } from "../shared/aefFramelessGeometry";

const APPLY = process.argv.includes("--apply");
const ROOT = process.cwd();
const PRICE_AUDIT = path.resolve(ROOT, "../altaeuro_catalog/frameless_v10_sku_audit.csv");

const IMAGES = {
  "base-double-door-drawer": "/manus-storage/aef-base-double-door-drawer_9e39a6d5.png",
  "base-easy-reach": "/manus-storage/aef-base-easy-reach_a1a6f949.png",
  "base-full-height": "/manus-storage/aef-base-full-height_0957f9a7.png",
  "base-single-door-drawer": "/manus-storage/aef-base-single-door-drawer_cee98712.png",
  "base-sink": "/manus-storage/aef-base-sink_4366028a.png",
  "tall-four-door": "/manus-storage/aef-tall-four-door_2ac63158.png",
  "tall-two-door": "/manus-storage/aef-tall-two-door_e9ee27db.png",
  "vanity-full-height": "/manus-storage/aef-vanity-full-height_489549f6.png",
  "vanity-standard": "/manus-storage/aef-vanity-standard_3940272b.png",
  "vanity-tall": "/manus-storage/aef-vanity-tall_e336ad76.png",
  "wall-bridge-and-corner": "/manus-storage/aef-wall-bridge-and-corner_ed0fca13.png",
  "wall-bridge": "/manus-storage/aef-wall-bridge_faacd610.png",
  "wall-refrigerator": "/manus-storage/aef-wall-refrigerator_c21e0659.png",
  "wall-standard-30": "/manus-storage/aef-wall-standard-30_fa0f8c55.png",
  "wall-standard-35": "/manus-storage/aef-wall-standard-35_2c082db4.png",
  "wall-standard-40": "/manus-storage/aef-wall-standard-40_cefbe3d0.png",
} as const;

type Family = keyof typeof IMAGES;
type Layout = {
  numberOfDoors: number;
  numberOfDrawers: number;
  doorsPerRow: number | null;
  doorOrientation: "side-by-side" | "stacked" | null;
  graphicType: string;
  isCornerCabinet?: boolean;
  cornerType?: "l-shape";
  layoutSpec: string;
};

type CsvRow = {
  sku: string;
  prices: string;
  geometry_status: string;
};

type RefRow = {
  id: number;
  cabinetId: number;
  distributorSku: string;
  platformSku: string;
  listPrice: string | null;
  yourCost: string | null;
  geometryStatus: string | null;
  constructionType: string | null;
};

function parseCsv(): Map<string, number> {
  const raw = fs.readFileSync(PRICE_AUDIT, "utf8").trim().split(/\r?\n/);
  const [head, ...lines] = raw;
  const fields = head.split(",");
  const col = (name: string) => fields.indexOf(name);
  const skuAt = col("sku");
  const pricesAt = col("prices");
  const geometryAt = col("geometry_status");
  if ([skuAt, pricesAt, geometryAt].some((n) => n < 0)) throw new Error("AEF audit CSV has unexpected columns");
  const out = new Map<string, number>();
  for (const line of lines) {
    // This audit has no quoted CSV fields. Keep the parser deliberately narrow.
    const cells = line.split(",");
    const row: CsvRow = { sku: cells[skuAt] ?? "", prices: cells[pricesAt] ?? "", geometry_status: cells[geometryAt] ?? "" };
    if (row.geometry_status !== "MATCH") continue;
    const price = Number(row.prices.split("|")[5]); // SCL: Syncron Slim Cava Rosales 3, column 6.
    if (!row.sku || !Number.isFinite(price) || price <= 0) throw new Error(`Invalid SCL source price for ${row.sku}`);
    out.set(row.sku.toUpperCase(), price);
  }
  if (out.size !== 115) throw new Error(`Expected 115 geometry-verified source SKUs; got ${out.size}`);
  return out;
}

function familyFor(masterCode: string): Family {
  const code = masterCode.toUpperCase();
  if (/^(B\d+FH|SB\d+FH)$/.test(code)) return "base-full-height";
  if (/^BER/.test(code)) return "base-easy-reach";
  if (/^SB/.test(code)) return "base-sink";
  if (/^B(12|15|18|21|24S)$/.test(code)) return "base-single-door-drawer";
  if (/^B/.test(code)) return "base-double-door-drawer";
  if (/^WER/.test(code)) return "wall-bridge-and-corner";
  if (/^W\d+(12|15|18|23)24$/.test(code)) return "wall-refrigerator";
  if (/^W\d+(12|15|18|23)$/.test(code)) return "wall-bridge";
  if (/^W\d+35$/.test(code)) return "wall-standard-35";
  if (/^W\d+40$/.test(code)) return "wall-standard-40";
  if (/^W/.test(code)) return "wall-standard-30";
  if (/^T(18|24)/.test(code)) return "tall-two-door";
  if (/^T/.test(code)) return "tall-four-door";
  if (/^VT/.test(code)) return "vanity-tall";
  if (/^VSB\d+FH$/.test(code)) return "vanity-full-height";
  if (/^VSB/.test(code)) return "vanity-standard";
  throw new Error(`No AEF image family for ${masterCode}`);
}

function layoutFor(masterCode: string): Layout {
  const code = masterCode.toUpperCase();
  const withDrawer = (doors: number, graphicType: string, label: string): Layout => ({
    numberOfDoors: doors, numberOfDrawers: 1, doorsPerRow: doors > 1 ? 2 : 1,
    doorOrientation: doors > 1 ? "side-by-side" : null, graphicType,
    layoutSpec: `${label}; front layout is taken from the AltaEuro V8.2 source drawing.`,
  });
  const fullHeight = (doors: number, graphicType: string, label: string): Layout => ({
    numberOfDoors: doors, numberOfDrawers: 0, doorsPerRow: doors > 1 ? 2 : 1,
    doorOrientation: doors > 1 ? "side-by-side" : null, graphicType,
    layoutSpec: `${label}; front layout is taken from the AltaEuro V8.2 source drawing.`,
  });
  if (/^B\d+FH$/.test(code)) return fullHeight(Number(code.match(/^B(\d+)/)?.[1]) >= 24 ? 2 : 1, Number(code.match(/^B(\d+)/)?.[1]) >= 24 ? "base_2door_fullheight" : "base_1door", "Full-height base");
  if (/^B(12|15|18|21|24S)$/.test(code)) return withDrawer(1, "base_1door_1drawer", "Single-door base with one drawer");
  if (/^B(24|27|30|33|36)$/.test(code)) return withDrawer(2, "base_2door_1drawer", "Double-door base with one drawer");
  if (/^BER/.test(code)) return { numberOfDoors: 2, numberOfDrawers: 0, doorsPerRow: 2, doorOrientation: "side-by-side", graphicType: "base_easy_reach", isCornerCabinet: true, cornerType: "l-shape", layoutSpec: "Easy-reach base; two doors; AltaEuro V8.2 page 32." };
  if (/^SB24S$/.test(code)) return withDrawer(1, "base_1door_1drawer", "Single-door sink base with one false drawer front");
  if (/^SB\d+FH$/.test(code)) return fullHeight(2, "base_2door_fullheight", "Full-height double-door sink base");
  if (/^SB/.test(code)) return withDrawer(2, "base_2door_1drawer", "Double-door sink base with one false drawer front");
  if (/^W(ER)?/.test(code)) {
    const standard = /^W\d+(30|35|40)$/.test(code) && !/^W2430S$/.test(code);
    const width = Number((/^W(?:ER)?(\d{2})/.exec(code) ?? [])[1] ?? 0);
    const doors = standard && width >= 24 ? 2 : 1;
    return {
      numberOfDoors: doors, numberOfDrawers: 0, doorsPerRow: doors > 1 ? 2 : 1,
      doorOrientation: doors > 1 ? "side-by-side" : null,
      graphicType: /^WER/.test(code) ? "wall_easy_reach" : doors > 1 ? "wall_2door" : "wall_1door",
      ...( /^WER/.test(code) ? { isCornerCabinet: true, cornerType: "l-shape" as const } : {}),
      layoutSpec: /^WER/.test(code) ? "Wall easy-reach cabinet; one door; AltaEuro V8.2 page 43." : standard ? `${doors}-door standard wall cabinet; AltaEuro V8.2 pages 37–39.` : "Single-door bridge/refrigerator wall cabinet; AltaEuro V8.2 pages 43–48.",
    };
  }
  if (/^T(18|24)/.test(code) || /^VT18/.test(code)) return { numberOfDoors: 2, numberOfDrawers: 0, doorsPerRow: 1, doorOrientation: "stacked", graphicType: "tall_2door", layoutSpec: "Tall two-door utility cabinet; vertically stacked doors; AltaEuro V8.2 pages 50 and 69." };
  if (/^T/.test(code)) return { numberOfDoors: 4, numberOfDrawers: 0, doorsPerRow: 2, doorOrientation: "stacked", graphicType: "tall_4door", layoutSpec: "Tall four-door utility cabinet; two-over-two doors; AltaEuro V8.2 page 51." };
  if (/^VSB24S$/.test(code)) return withDrawer(1, "vanity_1door_1drawer", "Single-door vanity sink base with one false drawer front");
  if (/^VSB\d+FH$/.test(code)) return fullHeight(2, "vanity_2door_fullheight", "Full-height double-door vanity sink base");
  if (/^VSB/.test(code)) return withDrawer(2, "vanity_2door_1drawer", "Double-door vanity sink base with one false drawer front");
  throw new Error(`No AEF face layout for ${masterCode}`);
}

function costFromList(list: number): number {
  // Exact U.S. Cabinet Depot landed cost rule: round(list × .23, 2), then apply 7% freight and round again.
  return Math.round((Math.round(list * 0.23 * 100) / 100) * 1.07 * 100) / 100;
}

async function main() {
  const sclPrices = parseCsv();
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  try {
    const [[aef]]: any = await conn.query("SELECT * FROM distributors WHERE code = 'AEF' LIMIT 1");
    const [[uscd]]: any = await conn.query("SELECT * FROM distributors WHERE code = 'USCD' LIMIT 1");
    const [[pricing]]: any = await conn.query("SELECT * FROM pricing_settings ORDER BY id LIMIT 1");
    if (!aef || !uscd || !pricing) throw new Error("AEF, USCD, or pricing settings record is missing");
    if (Number(uscd.baseMultiplier) !== 0.23 || Number(uscd.freightMultiplier) !== 0.07) throw new Error("USCD multiplier no longer matches approved 23% + 7% rule");
    if (Number(pricing.homeownerMarkupBps) !== 15800 || Number(pricing.contractorMarkupBps) !== 12900 || Number(pricing.wholesaleMarkupBps) !== 12500) throw new Error("Platform tier settings no longer match approved homeowner/contractor/wholesale rules");

    const [scmRowsRaw]: any = await conn.query(
      `SELECT ds.id, ds.cabinetId, ds.distributorSku, ds.platformSku, ds.listPrice, ds.yourCost, ds.geometryStatus, ds.constructionType
       FROM distributor_skus ds JOIN door_styles s ON s.id=ds.styleId
       WHERE ds.distributorId=? AND s.styleCode='SCM' AND ds.geometryStatus='verified' ORDER BY ds.distributorSku`, [aef.id],
    );
    const refs = scmRowsRaw as RefRow[];
    if (refs.length !== 115 || new Set(refs.map((row) => row.cabinetId)).size !== 115) throw new Error(`Expected 115 verified SCM source rows; got ${refs.length}`);
    for (const row of refs) {
      if (!sclPrices.has(row.distributorSku.toUpperCase()) || row.geometryStatus !== "verified" || row.constructionType !== "frameless") {
        throw new Error(`Invalid verified reference row ${row.distributorSku}`);
      }
    }

    const [masters]: any = await conn.query(
      `SELECT c.id,c.masterCode,c.isActive,c.showInCatalog,c.showInDesigner,
              SUM(CASE WHEN d.code <> 'AEF' THEN 1 ELSE 0 END) AS nonAefSkuCount
       FROM cabinets c JOIN distributor_skus ds ON ds.cabinetId=c.id JOIN distributors d ON d.id=ds.distributorId
       WHERE c.id IN (${refs.map(() => "?").join(",")}) GROUP BY c.id,c.masterCode,c.isActive,c.showInCatalog,c.showInDesigner`,
      refs.map((row) => row.cabinetId),
    );
    const masterById = new Map<number, any>(masters.map((row: any) => [row.id, row]));
    if (masterById.size !== 115) throw new Error("Not every AEF source row maps to a master cabinet");

    const [[sclStyle]]: any = await conn.query("SELECT * FROM door_styles WHERE distributorId=? AND styleCode='SCL' LIMIT 1", [aef.id]);
    if (!sclStyle) throw new Error("SCL door style is missing");
    const [oldSclRowsRaw]: any = await conn.query("SELECT * FROM distributor_skus WHERE distributorId=? AND styleId=?", [aef.id, sclStyle.id]);
    const oldSclRows = oldSclRowsRaw as any[];
    if (oldSclRows.length !== 92) throw new Error(`Expected 92 held SCL rows before repair; got ${oldSclRows.length}`);
    const oldSclBySource = new Map<string, any>(oldSclRows.map((row) => [String(row.distributorSku).toUpperCase(), row]));
    const refBySource = new Map<string, RefRow>(refs.map((row) => [row.distributorSku.toUpperCase(), row]));
    const expectedSources = new Set(refs.map((row) => row.distributorSku.toUpperCase()));
    for (const old of oldSclRows) {
      const sku = String(old.distributorSku).toUpperCase();
      if (!expectedSources.has(sku)) throw new Error(`Held SCL row has an unknown SKU: ${sku}`);
      const expected = sclPrices.get(sku)!;
      if (Number(old.listPrice) !== expected) throw new Error(`SCL list price mismatch before release: ${sku}`);
    }

    const [existingOverrides]: any = await conn.query("SELECT * FROM distributor_cabinet_overrides WHERE distributorId=?", [aef.id]);
    const overrideByCabinetId = new Map<number, any>(existingOverrides.map((row: any) => [row.cabinetId, row]));
    const releaseSummary = {
      mode: APPLY ? "apply" : "preflight",
      line: { before: { name: aef.name, brandName: aef.brandName, baseMultiplier: aef.baseMultiplier, freightMultiplier: aef.freightMultiplier, retailPriceBasis: aef.retailPriceBasis }, after: { name: "US Cabinet Depot Frameless", brandName: "U.S. Cabinet Depot — Frameless", baseMultiplier: "0.2300", freightMultiplier: "0.0700", retailPriceBasis: "cost_plus_tier" } },
      verifiedSourceSkus: refs.length,
      existingSclRows: oldSclRows.length,
      missingSclRowsToCreate: refs.filter((row) => !oldSclBySource.has(row.distributorSku.toUpperCase())).length,
      SclRowsToRemap: refs.filter((row) => oldSclBySource.has(row.distributorSku.toUpperCase()) && oldSclBySource.get(row.distributorSku.toUpperCase()).cabinetId !== row.cabinetId).length,
      lineSkuRowsToPublish: refs.length * 49,
      heldRowsExcluded: 162,
      masterVisibilityChanges: masters.filter((m: any) => !Number(m.nonAefSkuCount) && (!m.isActive || !m.showInCatalog || !m.showInDesigner)).map((m: any) => m.masterCode),
      exampleHomeownerPrices: refs.filter((row) => ["B18", "W3012", "W3030"].includes(row.distributorSku)).map((row) => { const list=sclPrices.get(row.distributorSku)!; const cost=costFromList(list); return { sku: row.distributorSku, sclListPrice: list, landedCost: cost, homeowner: Math.round(cost*1.58*100)/100 }; }),
    };
    console.log(JSON.stringify(releaseSummary, null, 2));
    if (!APPLY) return;

    await conn.beginTransaction();
    try {
      await conn.query(
        `UPDATE distributors SET name=?, brandName=?, isActive=1, baseMultiplier='0.2300', freightMultiplier='0.0700', tariffRate='0.0700', costMultiplier='0.2461', retailPriceBasis='cost_plus_tier' WHERE id=?`,
        ["US Cabinet Depot Frameless", "U.S. Cabinet Depot — Frameless", aef.id],
      );
      await conn.query(
        `UPDATE door_styles SET doorSampleImageUrl=?, thumbnailImageUrl=?, cornerSwatchImageUrl=?, doorSampleVerified=1, isActive=1 WHERE id=?`,
        ["/manus-storage/SCL_cd4802db.png", "/manus-storage/SCL_cd4802db.png", "/manus-storage/SCL_cd4802db.png", sclStyle.id],
      );

      // Rebuild SCL from the exact same verified source identities as SCM, with its own printed price column.
      // Some old SCL source rows occupy an incorrect shared-master ID (for example,
      // B12FH occupied B12). Remap the existing source identities first so that a
      // later insert for the real B12 does not violate the unique line/cabinet/style
      // constraint. All targets are distinct by the validated SCM reference set.
      for (const old of oldSclRows) {
        const ref = refBySource.get(String(old.distributorSku).toUpperCase());
        if (!ref) throw new Error(`No SCL source reference for ${old.distributorSku}`);
        if (old.cabinetId !== ref.cabinetId) {
          await conn.query(`UPDATE distributor_skus SET cabinetId=? WHERE id=?`, [ref.cabinetId, old.id]);
        }
      }
      for (const ref of refs) {
        const sourceSku = ref.distributorSku.toUpperCase();
        const list = sclPrices.get(sourceSku)!;
        const cost = costFromList(list);
        const geometry = aefPrintedGeometryForSku(sourceSku);
        if (!geometry) throw new Error(`No printed AEF geometry for ${sourceSku}`);
        const old = oldSclBySource.get(sourceSku);
        const values = [
          ref.cabinetId, `AEF-${sourceSku}-SCL`, sourceSku, geometry.constructionType,
          geometry.width.toFixed(2), geometry.height.toFixed(2), geometry.depth.toFixed(2), geometry.toeKickHeight?.toFixed(2) ?? null,
          `AltaEuro Collection Full Spec Book V8.2, p. ${geometry.sourcePage}`, geometry.status,
          list.toFixed(2), cost.toFixed(2), cost.toFixed(2), (cost * 1.25).toFixed(2), (cost * 1.29).toFixed(2), (cost * 1.58).toFixed(2),
        ];
        if (old) {
          await conn.query(
            `UPDATE distributor_skus SET cabinetId=?, platformSku=?, distributorSku=?, constructionType=?, geometryWidth=?, geometryHeight=?, geometryDepth=?, geometryToeKickHeight=?, geometrySourcePage=?, geometryStatus=?, listPrice=?, yourCost=?, adjustedListPrice=?, wholesalePrice=?, contractorPrice=?, homeownerPrice=?, isAvailable=1, isPublished=1, status='approved' WHERE id=?`,
            [...values, old.id],
          );
        } else {
          await conn.query(
            `INSERT INTO distributor_skus (cabinetId,distributorId,styleId,platformSku,distributorSku,constructionType,geometryWidth,geometryHeight,geometryDepth,geometryToeKickHeight,geometrySourcePage,geometryStatus,listPrice,yourCost,adjustedListPrice,wholesalePrice,contractorPrice,homeownerPrice,isAvailable,isPublished,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'approved')`,
            [ref.cabinetId, aef.id, sclStyle.id, ...values.slice(1), true, true],
          );
        }
      }

      // Apply the current USCD landed-cost multiplier and current platform tier settings to all published verified AEF rows.
      await conn.query(
        `UPDATE distributor_skus SET
          yourCost=ROUND(ROUND(listPrice*0.23,2)*1.07,2),
          adjustedListPrice=ROUND(ROUND(listPrice*0.23,2)*1.07,2),
          wholesalePrice=ROUND(ROUND(ROUND(listPrice*0.23,2)*1.07,2)*1.25,2),
          contractorPrice=ROUND(ROUND(ROUND(listPrice*0.23,2)*1.07,2)*1.29,2),
          homeownerPrice=ROUND(ROUND(ROUND(listPrice*0.23,2)*1.07,2)*1.58,2),
          isAvailable=1,isPublished=1,status='approved'
         WHERE distributorId=? AND geometryStatus='verified' AND listPrice>0`, [aef.id],
      );
      // Preserve every geometry-held record outside customer surfaces.
      await conn.query(`UPDATE distributor_skus SET isAvailable=0,isPublished=0 WHERE distributorId=? AND (geometryStatus IS NULL OR geometryStatus <> 'verified')`, [aef.id]);

      for (const ref of refs) {
        const master = masterById.get(ref.cabinetId);
        const code = String(master.masterCode).toUpperCase();
        const geometry = aefPrintedGeometryForSku(ref.distributorSku);
        if (!geometry) throw new Error(`No AEF geometry for override ${ref.distributorSku}`);
        const layout = layoutFor(code);
        const oldOverride = overrideByCabinetId.get(ref.cabinetId);
        const priorConfig = oldOverride?.configJson ? JSON.parse(oldOverride.configJson) : {};
        const config = {
          ...priorConfig,
          numberOfDoors: layout.numberOfDoors,
          numberOfDrawers: layout.numberOfDrawers,
          doorsPerRow: layout.doorsPerRow,
          doorOrientation: layout.doorOrientation,
          graphicType: layout.graphicType,
          isCornerCabinet: layout.isCornerCabinet ?? false,
          cornerType: layout.cornerType ?? null,
          layoutSpec: layout.layoutSpec,
          specImageUrl: IMAGES[familyFor(code)],
          specNotes: `U.S. Cabinet Depot Frameless. Printed geometry: ${geometry.width}\" W × ${geometry.height}\" H × ${geometry.depth}\" D. AltaEuro V8.2 p. ${geometry.sourcePage}.`,
        };
        await conn.query(
          `INSERT INTO distributor_cabinet_overrides (distributorId,cabinetId,width,height,depth,imageUrl,configJson,note)
           VALUES (?,?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE width=VALUES(width),height=VALUES(height),depth=VALUES(depth),imageUrl=VALUES(imageUrl),configJson=VALUES(configJson),note=VALUES(note)`,
          [aef.id, ref.cabinetId, geometry.width.toFixed(2), geometry.height.toFixed(2), geometry.depth.toFixed(2), IMAGES[familyFor(code)], JSON.stringify(config), "AEF V8.2 printed geometry, source image, and face layout; shared master unchanged."],
        );
      }
      // Masters used only by AEF may be turned on; shared framed masters are never modified.
      const aefOnlyIds = masters.filter((m: any) => !Number(m.nonAefSkuCount)).map((m: any) => m.id);
      if (aefOnlyIds.length) await conn.query(`UPDATE cabinets SET isActive=1,showInCatalog=1,showInDesigner=1 WHERE id IN (${aefOnlyIds.map(() => "?").join(",")})`, aefOnlyIds);
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    }
  } finally {
    await conn.end();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
