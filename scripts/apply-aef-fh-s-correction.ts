import { readFileSync } from "node:fs";
import { and, eq, inArray, ne } from "drizzle-orm";
import { getDb } from "../server/db";
import { cabinets, distributorSkus, doorStyles, distributors } from "../drizzle/schema";
import { aefPrintedGeometryForSku } from "../shared/aefFramelessGeometry";

const AUDIT_PATH = process.env.AEF_AUDIT_PATH ?? "/home/ubuntu/altaeuro_catalog/frameless_v10_sku_audit.csv";
const AEF_CODE = "AEF";
const SCL_STYLE_CODE = "SCL";
const SPECIAL_MASTER_TEMPLATES: Record<string, string> = {
  SB24FH: "SB24",
  SB27FH: "SB27",
  SB30FH: "SB30",
  SB33FH: "SB33",
  SB36FH: "SB36",
  VSB24FH: "VSB24",
  VSB27FH: "VSB27",
  VSB30FH: "VSB30",
  VSB33FH: "VSB33",
  VSB36FH: "VSB36",
  B24S: "B24",
  SB24S: "SB24",
  W2430S: "W2430",
  VSB24S: "VSB24",
};

function csvRows(path: string): Array<Record<string, string>> {
  const lines = readFileSync(path, "utf8").trim().split(/\r?\n/);
  const headers = lines.shift()!.split(",");
  return lines.map((line) => {
    const values = line.split(",");
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function cloneValues(row: Record<string, unknown>, masterCode: string): Record<string, unknown> {
  const omit = new Set(["id", "createdAt", "configuredAt", "conflictedAt", "priceVerifiedAt", "configVerifiedAt"]);
  const values: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (!omit.has(key)) values[key] = value;
  }
  values.masterCode = masterCode;
  values.showInCatalog = false;
  values.showInDesigner = false;
  values.showIn2020 = false;
  values.isActive = true;
  values.conflictStatus = "none";
  values.priceVerified = false;
  values.configVerified = false;
  return values;
}

function priceIndexForStyle(styleCode: string): number {
  if (["TWP", "TGW", "TDW"].includes(styleCode)) return 0;
  if (styleCode === "PGW") return 1;
  if (styleCode.startsWith("SS")) return 2;
  if (["LSA", "LSN", "LSC"].includes(styleCode) || (styleCode.startsWith("ZS") && !["ZCC", "ZCN", "ZCK"].includes(styleCode))) return 3;
  if (["LSP", "LSR"].includes(styleCode)) return 4;
  if (styleCode.startsWith("SC")) return 5;
  if (styleCode.startsWith("ZC")) return 6;
  throw new Error(`No AEF price-column mapping for style ${styleCode}`);
}

function dollarsForAuditRow(row: Record<string, string>, styleCode: string): string {
  const prices = (row.prices ?? "").split("|").map((value) => value.trim());
  const value = prices[priceIndexForStyle(styleCode)];
  if (!value || !/^\d+(?:\.\d{1,2})?$/.test(value)) throw new Error(`Invalid printed price for ${row.sku}/${styleCode}: ${value}`);
  return Number(value).toFixed(2);
}

async function main() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const audit = csvRows(AUDIT_PATH);
  const verifiedSkus = audit
    .filter((row) => row.geometry_status === "MATCH")
    .map((row) => row.sku.trim().toUpperCase());
  if (verifiedSkus.length !== 115) throw new Error(`Expected 115 verified AEF rows, found ${verifiedSkus.length}`);
  const heldSkus = audit.filter((row) => row.geometry_status !== "MATCH").map((row) => row.sku.trim().toUpperCase());
  const [aef] = await db.select({ id: distributors.id }).from(distributors).where(eq(distributors.code, AEF_CODE)).limit(1);
  if (!aef) throw new Error("AEF distributor not found");
  const [scl] = await db.select({ id: doorStyles.id }).from(doorStyles).where(and(eq(doorStyles.distributorId, aef.id), eq(doorStyles.styleCode, SCL_STYLE_CODE))).limit(1);
  if (!scl) throw new Error("AEF SCL style not found");

  const targetMasters = Array.from(new Set(verifiedSkus));
  const before = await db
    .select({ id: distributorSkus.id, distributorSku: distributorSkus.distributorSku, cabinetId: distributorSkus.cabinetId, styleId: distributorSkus.styleId, isPublished: distributorSkus.isPublished, listPrice: distributorSkus.listPrice })
    .from(distributorSkus)
    .where(and(eq(distributorSkus.distributorId, aef.id), inArray(distributorSkus.distributorSku, verifiedSkus)));
  const beforeNonScl = before.filter((row) => row.styleId !== scl.id);
  if (!beforeNonScl.length) throw new Error("No non-SCL verified AEF source rows found");
  if (beforeNonScl.some((row) => row.isPublished)) throw new Error("Refusing to touch a published AEF row");

  const existing = await db.select().from(cabinets).where(inArray(cabinets.masterCode, Object.keys(SPECIAL_MASTER_TEMPLATES)));
  const existingByCode = new Map(existing.map((row) => [row.masterCode, row]));
  const created: string[] = [];
  for (const [targetCode, templateCode] of Object.entries(SPECIAL_MASTER_TEMPLATES)) {
    if (existingByCode.has(targetCode)) continue;
    const [template] = await db.select().from(cabinets).where(eq(cabinets.masterCode, templateCode)).limit(1);
    if (!template) throw new Error(`Missing template cabinet ${templateCode} for ${targetCode}`);
    const values = cloneValues(template as unknown as Record<string, unknown>, targetCode);
    // Preserve the template's rendering profile, but give the four S identities
    // their own single-door layout instead of silently borrowing a two-door master.
    if (targetCode.endsWith("S")) {
      values.numberOfDoors = 1;
      values.doorsPerRow = 1;
      if (targetCode.startsWith("B") && !targetCode.startsWith("SB") && !targetCode.startsWith("VSB")) {
        values.numberOfDrawers = 1;
      }
    }
    await db.insert(cabinets).values(values as never);
    created.push(targetCode);
  }

  const masters = await db.select({ id: cabinets.id, masterCode: cabinets.masterCode }).from(cabinets).where(inArray(cabinets.masterCode, targetMasters));
  const masterByCode = new Map(masters.map((row) => [row.masterCode, row.id]));
  const missingMasters = targetMasters.filter((code) => !masterByCode.has(code));
  if (missingMasters.length) throw new Error(`Missing verified target masters: ${missingMasters.join(", ")}`);

  for (const sku of verifiedSkus) {
    const geometry = aefPrintedGeometryForSku(sku);
    if (!geometry) throw new Error(`No printed geometry resolver for verified SKU ${sku}`);
    const targetCabinetId = masterByCode.get(sku)!;
    await db
      .update(distributorSkus)
      .set({
        cabinetId: targetCabinetId,
        constructionType: geometry.constructionType,
        geometryWidth: geometry.width.toFixed(2),
        geometryHeight: geometry.height.toFixed(2),
        geometryDepth: geometry.depth.toFixed(2),
        geometryToeKickHeight: geometry.toeKickHeight == null ? null : geometry.toeKickHeight.toFixed(2),
        geometrySourcePage: `AltaEuro Collection Full Spec Book V8.2, pp. ${geometry.sourcePage}`,
        geometryStatus: geometry.status,
      })
      .where(and(
        eq(distributorSkus.distributorId, aef.id),
        eq(distributorSkus.distributorSku, sku),
        ne(distributorSkus.styleId, scl.id),
      ));
  }

  // The first staging pass had rows for the 92 canonical source codes, while
  // the approved price sheet contains 115 geometry-verified source SKUs. Add
  // the missing 23 source codes using the existing AEF row for each style as
  // the non-price template. SCL remains intentionally excluded.
  const auditBySku = new Map(audit.map((row) => [row.sku.trim().toUpperCase(), row]));
  const styleRows = await db
    .select()
    .from(distributorSkus)
    .where(and(eq(distributorSkus.distributorId, aef.id), eq(distributorSkus.distributorSku, "B12FH"), ne(distributorSkus.styleId, scl.id)));
  const templateByStyleId = new Map(styleRows.map((row) => [row.styleId, row]));
  const existingKeys = new Set(before.map((row) => `${row.distributorSku}:${row.styleId}`));
  const missingRows: Record<string, unknown>[] = [];
  for (const sku of verifiedSkus) {
    const auditRow = auditBySku.get(sku)!;
    const geometry = aefPrintedGeometryForSku(sku)!;
    const targetCabinetId = masterByCode.get(sku)!;
    for (const [styleId, template] of templateByStyleId) {
      const key = `${sku}:${styleId}`;
      if (existingKeys.has(key)) continue;
      const style = await db.select({ styleCode: doorStyles.styleCode }).from(doorStyles).where(eq(doorStyles.id, styleId)).limit(1);
      const styleCode = style[0]?.styleCode;
      if (!styleCode) throw new Error(`Missing AEF style ${styleId}`);
      const values = cloneValues(template as unknown as Record<string, unknown>, sku);
      values.cabinetId = targetCabinetId;
      values.distributorId = aef.id;
      values.styleId = styleId;
      values.platformSku = `AEF-${sku}-${styleCode}`;
      values.distributorSku = sku;
      values.listPrice = dollarsForAuditRow(auditRow, styleCode);
      values.pkgWeight = auditRow.weight_lb ? Number(auditRow.weight_lb).toFixed(2) : null;
      values.supplierCabinetName = sku;
      values.isAvailable = true;
      values.isPublished = false;
      values.status = "approved";
      values.constructionType = geometry.constructionType;
      values.geometryWidth = geometry.width.toFixed(2);
      values.geometryHeight = geometry.height.toFixed(2);
      values.geometryDepth = geometry.depth.toFixed(2);
      values.geometryToeKickHeight = geometry.toeKickHeight == null ? null : geometry.toeKickHeight.toFixed(2);
      values.geometrySourcePage = `AltaEuro Collection Full Spec Book V8.2, pp. ${geometry.sourcePage}`;
      values.geometryStatus = geometry.status;
      missingRows.push(values);
    }
  }
  if (missingRows.length) await db.insert(distributorSkus).values(missingRows as never);

  const after = await db
    .select({ distributorSku: distributorSkus.distributorSku, cabinetId: distributorSkus.cabinetId, styleId: distributorSkus.styleId, isPublished: distributorSkus.isPublished, listPrice: distributorSkus.listPrice, constructionType: distributorSkus.constructionType, geometryWidth: distributorSkus.geometryWidth, geometryHeight: distributorSkus.geometryHeight, geometryDepth: distributorSkus.geometryDepth, geometryToeKickHeight: distributorSkus.geometryToeKickHeight, geometryStatus: distributorSkus.geometryStatus })
    .from(distributorSkus)
    .where(and(eq(distributorSkus.distributorId, aef.id), inArray(distributorSkus.distributorSku, verifiedSkus)));
  const changed = after.filter((row) => row.styleId !== scl.id);
  const expectedNonSclRows = verifiedSkus.length * templateByStyleId.size;
  if (changed.length !== expectedNonSclRows) throw new Error(`Expected ${expectedNonSclRows} non-SCL rows, found ${changed.length}`);
  if (changed.some((row) => row.isPublished)) throw new Error("A staged AEF row became published");
  if (changed.some((row) => row.geometryStatus !== "verified" || row.constructionType !== "frameless")) throw new Error("A verified AEF row is missing its override");
  const priceMapBefore = new Map(beforeNonScl.map((row) => [`${row.distributorSku}:${row.styleId}`, String(row.listPrice)]));
  const styleCodeById = new Map((await db.select({ id: doorStyles.id, styleCode: doorStyles.styleCode }).from(doorStyles).where(eq(doorStyles.distributorId, aef.id))).map((row) => [row.id, row.styleCode]));
  const priceChanges = changed.filter((row) => {
    const expected = priceMapBefore.get(`${row.distributorSku}:${row.styleId}`)
      ?? dollarsForAuditRow(auditBySku.get(row.distributorSku)!, styleCodeById.get(row.styleId)!);
    return expected !== String(row.listPrice);
  });
  if (priceChanges.length) throw new Error(`Price changed on ${priceChanges.length} AEF rows`);

  console.log(JSON.stringify({
    verifiedSourceSkus: verifiedSkus.length,
    distinctTargetMasters: targetMasters.length,
    createdMasters: created,
    createdMasterCount: created.length,
    heldSourceSkus: heldSkus.length,
    nonSclRowsVerified: changed.length,
    insertedNonSclRows: missingRows.length,
    sclStyleId: scl.id,
    pricesChanged: priceChanges.length,
    publicationViolations: changed.filter((row) => row.isPublished).length,
  }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
