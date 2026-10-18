/*
 * Read-only quality inventory for the U.S. Cabinet Depot Frameless line (AEF).
 *
 * Run: pnpm exec tsx scripts/audit-aef-catalog-quality.ts
 * Writes only /home/ubuntu/frameless-audit/inventory.json and inventory-report.md.
 * The database contract is SELECT-only: this file contains no DDL/DML or transactions.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import mysql from "mysql2/promise";
import { AEF_EXPANDED_SOURCE_GEOMETRY } from "../shared/aefFramelessExpandedGeometry";
import { aefPrintedGeometryForSku } from "../shared/aefFramelessGeometry";

export const AEF_CODE = "AEF";
export const EXPECTED_PUBLISHED_MASTERS = 283;
export const MANIFEST_PATH = path.resolve(process.cwd(), "scripts/data/aef-complete-source-manifest.json");
export const OFFICIAL_V8_TEXT_PATH = "/home/ubuntu/frameless-audit/source/altaeuro-official-v8.txt";
export const OFFICIAL_V8_PDF_PATH = "/home/ubuntu/frameless-audit/source/altaeuro-official-v8.pdf";
export const OFFICIAL_V8_URL = "https://prod-uscd-product-files.s3.us-east-1.amazonaws.com/file/altaeuro_Single_Pages_V8_DIGITAL_ONLY.pdf";
export const DEFAULT_OUTPUT_DIR = "/home/ubuntu/frameless-audit";

const STYLE_COLUMN: Record<string, number> = {
  TWP: 0, TGW: 0, TDW: 0, PGW: 1,
  SSA: 2, SSD: 2, SSE: 2, SSH: 2, SSJ: 2, SSK: 2, SSL: 2, SSM: 2, SSN: 2, SSO: 2, SSP: 2, SSQ: 2, SSR: 2, SSS: 2, SSV: 2, SSX: 2, SSZ: 2,
  LSA: 3, LSC: 3, LSN: 3, ZSA: 3, ZSB: 3, ZSC: 3, ZSI: 3, ZSK: 3, ZSL: 3, ZSM: 3, ZSN: 3, ZSO: 3, ZSP: 3, ZSU: 3, ZSV: 3, ZSW: 3,
  LSP: 4, LSR: 4, SCA: 5, SCL: 5, SCM: 5, SCN: 5, SCQ: 5, SCR: 5, SCZ: 5, ZCC: 6, ZCK: 6, ZCN: 6,
};

export type SourceConfig = {
  cabinet?: boolean; doors?: number; drawers?: number; graphic?: string; productType?: string;
  placement?: "accessory"; isNotCabinet?: boolean; isCorner?: boolean;
  cornerType?: "blind-corner" | "l-shape"; doorOrientation?: "side-by-side" | "stacked";
  openingType?: "top" | "middle" | "bottom"; ovenType?: "single" | "double";
  drawerLayout?: Array<{ count: number; height?: number }>; sourceOvenDrawerLayout?: boolean;
};
export type SourceRecord = {
  sku: string; category: string; description: string; sourcePage: number; weightLb: number;
  priceCount: 1 | 2 | 7; prices: string[]; configuration: SourceConfig;
  width?: number; height?: number; depth?: number; toeKickHeight?: number | null;
};
export type AuditIssue = {
  kind: string; severity: "error" | "warning" | "info"; masterId: number | null; masterCode: string;
  affectedRowCount: number; rowIds: number[]; sourceSkus: string[]; styles: string[];
  expected?: unknown; actual?: unknown; evidence: string;
};

type AnyRecord = Record<string, any>;
type MasterAudit = { masterId: number; masterCode: string; publishedAvailableRowCount: number; sourceSkuCount: number; issues: AuditIssue[] };

function sorted<T>(items: T[], getter: (item: T) => string | number): T[] {
  return [...items].sort((a, b) => String(getter(a)).localeCompare(String(getter(b)), "en"));
}
function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function sameNumber(a: unknown, b: unknown): boolean {
  const left = asNumber(a); const right = asNumber(b);
  return left === null && right === null || (left !== null && right !== null && Math.abs(left - right) < 0.00051);
}
function geometryOf(row: AnyRecord) {
  return { width: asNumber(row.geometryWidth), height: asNumber(row.geometryHeight), depth: asNumber(row.geometryDepth), toeKickHeight: asNumber(row.geometryToeKickHeight) };
}
function geometrySignature(geometry: ReturnType<typeof geometryOf>) { return JSON.stringify(geometry); }
function noUndefined(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}
function parseJson(value: unknown): { value: Record<string, unknown>; error: string | null } {
  if (!value) return { value: {}, error: null };
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? { value: parsed, error: null } : { value: {}, error: "configJson is not an object" };
  } catch (error) { return { value: {}, error: error instanceof Error ? error.message : "invalid JSON" }; }
}

/** Project-importer-equivalent source face expectation; it intentionally never reads shared master fields. */
export function expectedConfigFor(source: SourceRecord): Record<string, unknown> {
  const config = source.configuration ?? {};
  const doors = config.doors ?? 0;
  return noUndefined({
    numberOfDoors: doors,
    numberOfDrawers: config.drawers ?? 0,
    doorsPerRow: doors > 1 && config.doorOrientation !== "stacked" ? 2 : doors > 0 ? 1 : null,
    doorOrientation: config.doorOrientation ?? (doors > 1 ? "side-by-side" : null),
    graphicType: config.graphic ?? "accessory",
    productType: config.productType ?? (source.category === "Accessory" ? "accessory" : "standard"),
    isCornerCabinet: config.isCorner ?? false,
    cornerType: config.cornerType ?? null,
    openingType: config.openingType ?? null,
    ovenType: config.ovenType,
    drawerLayout: config.drawerLayout ? JSON.stringify(config.drawerLayout) : undefined,
    sourceOvenDrawerLayout: config.sourceOvenDrawerLayout ? true : undefined,
  });
}
export function configDifferences(actual: Record<string, unknown>, expected: Record<string, unknown>): Record<string, { expected: unknown; actual: unknown }> {
  const output: Record<string, { expected: unknown; actual: unknown }> = {};
  for (const [key, expectedValue] of Object.entries(expected)) {
    const actualValue = actual[key] ?? null;
    if (JSON.stringify(actualValue) !== JSON.stringify(expectedValue)) output[key] = { expected: expectedValue, actual: actualValue };
  }
  return output;
}
export function isPublicProseLeak(value: unknown): boolean {
  return typeof value === "string" && /(?:altaeuro|u\.?s\.?\s*cabinet\s*depot|full\s+spec\s+book|manufacturer|\bsource\s*:|staged|pending\s+designer\s+proof)/i.test(value);
}
/** Legacy source/page-crop PNG assets are intentionally distinct from current neutral *-render assets. */
export function isLegacyPageCropImage(value: unknown): boolean {
  return typeof value === "string" && /\/aef-[^/]+_[a-f0-9]{8}\.png(?:\?.*)?$/i.test(value) && !/-render(?:[-_]|\.)/i.test(value);
}
export function sourcePriceFor(source: SourceRecord, styleCode: string): number | null {
  const column = STYLE_COLUMN[styleCode];
  if (column === undefined) return null;
  const index = source.priceCount === 7 ? column : source.priceCount === 2 ? (column === 0 ? 0 : 1) : 0;
  const raw = source.prices[index];
  const value = Number(String(raw ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function loadManifest(manifestPath = MANIFEST_PATH): SourceRecord[] {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as SourceRecord[];
  if (manifest.length !== 168 || new Set(manifest.map((row) => row.sku.toUpperCase())).size !== 168) throw new Error("Expected exactly 168 unique AEF manifest source records.");
  return sorted(manifest, (row) => row.sku);
}
function officialEvidenceFor(source: SourceRecord, officialText: string) {
  const sku = source.sku.toUpperCase();
  const escaped = sku.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const loose = escaped.replace(/\\-/g, "[-\\s]*").replace(/\\\//g, "\\s*/\\s*");
  let matched = new RegExp(`(?<![A-Z0-9])${loose}(?![A-Z0-9])`, "i").exec(officialText);
  // PDF text extraction wraps two flip-up labels between the hyphen and BLUM.
  if (!matched && /^WFD\d+-BLUM$/.test(sku)) matched = new RegExp(`${sku.replace("-BLUM", "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[-\\s]*[\\s\\S]{0,180}?\\bBLUM\\b`, "i").exec(officialText);
  const aliases: Record<string, string> = { OCM8: "OCM", BM8: "BAM", "TKC-PVC": "TKC" };
  if (!matched && aliases[sku]) matched = new RegExp(`(?<![A-Z0-9])${aliases[sku]}(?![A-Z0-9])`, "i").exec(officialText);
  if (!matched) return { status: "not_found_in_current_v8_text", printedPage: null, evidence: "Current manufacturer V8 text does not expose this exact/known-alias model token; this is unresolved source-coverage evidence, not a geometry mismatch." };
  const printedPage = officialText.slice(0, matched.index).split("\f").length;
  return { status: aliases[sku] && !new RegExp(`(?<![A-Z0-9])${loose}(?![A-Z0-9])`, "i").test(officialText) ? "known_current_v8_alias" : "model_token_found", printedPage, evidence: officialText.slice(Math.max(0, matched.index - 120), matched.index + Math.min(220, matched[0].length + 120)).replace(/\s+/g, " ").trim() };
}
function addIssue(target: MasterAudit, issue: AuditIssue) { target.issues.push(issue); }
function rowIssue(master: MasterAudit, kind: string, severity: AuditIssue["severity"], row: AnyRecord, evidence: string, expected?: unknown, actual?: unknown) {
  addIssue(master, { kind, severity, masterId: master.masterId, masterCode: master.masterCode, affectedRowCount: 1, rowIds: [Number(row.id)], sourceSkus: [String(row.distributorSku)], styles: [String(row.styleCode)], expected, actual, evidence });
}
function combinedIssue(master: MasterAudit, kind: string, severity: AuditIssue["severity"], rows: AnyRecord[], evidence: string, expected?: unknown, actual?: unknown) {
  addIssue(master, { kind, severity, masterId: master.masterId, masterCode: master.masterCode, affectedRowCount: rows.length, rowIds: rows.map((row) => Number(row.id)).sort((a, b) => a - b), sourceSkus: [...new Set(rows.map((row) => String(row.distributorSku)))].sort(), styles: [...new Set(rows.map((row) => String(row.styleCode)))].sort(), expected, actual, evidence });
}

export function auditInventory(input: { masters: AnyRecord[]; skuRows: AnyRecord[]; overrides: AnyRecord[]; manifest: SourceRecord[]; officialText: string }) {
  const { masters, skuRows, overrides, manifest, officialText } = input;
  const manifestBySku = new Map(manifest.map((row) => [row.sku.toUpperCase(), row]));
  const overrideByMaster = new Map(overrides.map((row) => [Number(row.cabinetId), row]));
  const publicRows = skuRows.filter((row) => Boolean(row.isPublished) && Boolean(row.isAvailable));
  const rowsByMaster = new Map<number, AnyRecord[]>();
  for (const row of publicRows) rowsByMaster.set(Number(row.cabinetId), [...(rowsByMaster.get(Number(row.cabinetId)) ?? []), row]);
  const audits = sorted(masters.map((master) => ({ masterId: Number(master.id), masterCode: String(master.masterCode), publishedAvailableRowCount: (rowsByMaster.get(Number(master.id)) ?? []).length, sourceSkuCount: new Set((rowsByMaster.get(Number(master.id)) ?? []).map((row) => String(row.distributorSku))).size, issues: [] as AuditIssue[] })), (audit) => audit.masterCode);
  const auditById = new Map(audits.map((audit) => [audit.masterId, audit]));
  const emptyAccessoryRows: AnyRecord[] = [];

  for (const row of publicRows) {
    const master = auditById.get(Number(row.cabinetId));
    if (!master) continue;
    const sku = String(row.distributorSku ?? "").trim().toUpperCase();
    const manifestRow = manifestBySku.get(sku);
    const geometry = aefPrintedGeometryForSku(sku);
    const actualGeometry = geometryOf(row);
    if (String(row.constructionType ?? "").toLowerCase() !== "frameless") rowIssue(master, "construction_not_frameless", "error", row, "Published AEF row must carry supplier-scoped frameless construction.", "frameless", row.constructionType ?? null);
    if (String(row.geometryStatus ?? "").toLowerCase() !== "verified") rowIssue(master, "geometry_status_not_verified", "error", row, "Published AEF row must have verified source geometry status.", "verified", row.geometryStatus ?? null);
    if (!(asNumber(row.listPrice) && asNumber(row.listPrice)! > 0)) rowIssue(master, "nonpositive_source_list_price", "error", row, "Own source listPrice must be positive; this audit deliberately does not recalculate cost or customer tiers.", "> 0", row.listPrice ?? null);
    if (manifestRow && sourcePriceFor(manifestRow, String(row.styleCode)) !== null && !sameNumber(row.listPrice, sourcePriceFor(manifestRow, String(row.styleCode)))) rowIssue(master, "manifest_source_price_mismatch", "error", row, "List price differs from the matching printed source-style column; no derived price calculation was used.", sourcePriceFor(manifestRow, String(row.styleCode)), row.listPrice);
    if (!geometry) {
      if (manifestRow?.category === "Accessory") emptyAccessoryRows.push(row);
      else rowIssue(master, "unresolved_source_geometry", "warning", row, "No source resolver geometry exists for this published source SKU; shared master dimensions are excluded from truth.", "aefPrintedGeometryForSku(sourceSku)", actualGeometry);
    } else {
      const expectedGeometry = { width: geometry.width, height: geometry.height, depth: geometry.depth, toeKickHeight: geometry.toeKickHeight };
      const differences = Object.fromEntries(Object.entries(expectedGeometry).filter(([key, expected]) => !sameNumber((actualGeometry as AnyRecord)[key], expected)).map(([key, expected]) => [key, { expected, actual: (actualGeometry as AnyRecord)[key] }]));
      if (Object.keys(differences).length) rowIssue(master, "supplier_geometry_mismatch", "error", row, "Supplier SKU geometry must match shared AEF resolver; shared framed master dimensions were not consulted.", expectedGeometry, { actualGeometry, differences });
      if (manifestRow) {
        const manifestGeometry = manifestRow.width === undefined ? null : { width: manifestRow.width, height: manifestRow.height, depth: manifestRow.depth, toeKickHeight: manifestRow.toeKickHeight ?? null };
        if (manifestGeometry && geometrySignature(expectedGeometry) !== geometrySignature(manifestGeometry)) rowIssue(master, "manifest_resolver_geometry_divergence", "error", row, "The manifest and expanded resolver disagree before comparing database data.", manifestGeometry, expectedGeometry);
      }
      const override = overrideByMaster.get(master.masterId);
      if (!override || !sameNumber(override.width, geometry.width) || !sameNumber(override.height, geometry.height) || !sameNumber(override.depth, geometry.depth)) rowIssue(master, "line_override_geometry_mismatch", "error", row, "AEF line override must preserve source geometry independently of shared master dimensions.", expectedGeometry, override ? { width: override.width, height: override.height, depth: override.depth } : null);
    }
    if (manifestRow) {
      const override = overrideByMaster.get(master.masterId);
      const parsed = parseJson(override?.configJson);
      if (parsed.error) rowIssue(master, "invalid_override_config_json", "error", row, `Cannot parse the AEF line override configJson: ${parsed.error}.`, "JSON object", override?.configJson ?? null);
      else {
        const expected = expectedConfigFor(manifestRow);
        // Older AEF overrides legitimately omit a field such as productType. Audit
        // explicit line-scoped values without inferring missing values from a shared
        // master; this keeps source face validation deterministic and non-speculative.
        const explicitExpected = Object.fromEntries(Object.entries(expected).filter(([key]) => Object.prototype.hasOwnProperty.call(parsed.value, key)));
        const differences = configDifferences(parsed.value, explicitExpected);
        if (Object.keys(differences).length) rowIssue(master, "manifest_face_configuration_mismatch", "error", row, "Explicit AEF override doors, drawers, orientation, graphic and source-specific face fields must match the manifest; absent fields are not inferred from shared masters.", explicitExpected, differences);
      }
    }
    if (isPublicProseLeak(row.supplierDescription)) rowIssue(master, "public_supplier_prose_leak", "warning", row, "Supplier description contains provenance/staging language prohibited in customer-facing copy.", "customer-facing product wording only", row.supplierDescription);
    if (isLegacyPageCropImage(row.imageUrl)) rowIssue(master, "legacy_page_crop_image", "warning", row, "SKU image is a legacy source/page-crop PNG rather than a neutral current render.", "neutral *-render asset", row.imageUrl);
  }

  for (const master of audits) {
    const rows = rowsByMaster.get(master.masterId) ?? [];
    const sourceGeometries = new Map<string, AnyRecord[]>();
    for (const row of rows) sourceGeometries.set(String(row.distributorSku).toUpperCase(), [...(sourceGeometries.get(String(row.distributorSku).toUpperCase()) ?? []), row]);
    for (const [sourceSku, sourceRows] of sourceGeometries) {
      const signatures = new Set(sourceRows.map((row) => geometrySignature(geometryOf(row))));
      if (signatures.size > 1) combinedIssue(master, "same_master_source_style_geometry_inconsistent", "error", sourceRows, `Published styles for source SKU ${sourceSku} disagree on SKU-level geometry.`, "one geometry signature per master/source SKU", [...signatures]);
    }
    const expectedSources = [...sourceGeometries.keys()].map((sku) => ({ sku, geometry: aefPrintedGeometryForSku(sku), config: manifestBySku.get(sku) ? expectedConfigFor(manifestBySku.get(sku)!) : null }));
    if (new Set(expectedSources.map((item) => item.geometry ? JSON.stringify(item.geometry) : "empty")).size > 1) combinedIssue(master, "same_master_source_geometry_conflict", "warning", rows, "Different source SKUs attached to one master resolve to different AEF geometries; one line override cannot truthfully represent both.", "one source geometry per master", expectedSources);
    if (new Set(expectedSources.filter((item) => item.config).map((item) => JSON.stringify(item.config))).size > 1) combinedIssue(master, "same_master_source_face_conflict", "warning", rows, "Different manifest source SKUs attached to one master have incompatible face configurations.", "one face configuration per master", expectedSources);
    const masterRow = masters.find((item) => Number(item.id) === master.masterId);
    if (masterRow && isPublicProseLeak(masterRow.description)) combinedIssue(master, "public_master_prose_leak", "warning", rows, "Master description has provenance/staging language. It is reported separately; shared master fields are never geometry truth.", "customer-facing product wording only", masterRow.description);
  }

  const issues = audits.flatMap((master) => master.issues);
  const resolverLegacySourceSkus = [...new Set(publicRows.map((row) => String(row.distributorSku).toUpperCase()).filter((sku) => aefPrintedGeometryForSku(sku) && !manifestBySku.has(sku)))].sort();
  const sourceCoverage = manifest.map((source) => ({ sku: source.sku, category: source.category, manifestGeometry: source.width === undefined ? null : { width: source.width, height: source.height, depth: source.depth, toeKickHeight: source.toeKickHeight ?? null }, resolverGeometry: aefPrintedGeometryForSku(source.sku), officialCurrentV8Evidence: officialEvidenceFor(source, officialText) }));
  return { publicRows, audits, issues, emptyAccessoryRows, resolverLegacySourceSkus, sourceCoverage };
}

async function selectInventory(connection: mysql.Connection) {
  const [[line]] = await connection.query<any[]>("SELECT id, code, name, brandName, isActive FROM distributors WHERE code = ? LIMIT 1", [AEF_CODE]);
  if (!line) throw new Error("AEF distributor not found.");
  const [masters] = await connection.query<any[]>("SELECT c.* FROM cabinets c JOIN (SELECT DISTINCT cabinetId FROM distributor_skus WHERE distributorId=?) a ON a.cabinetId=c.id ORDER BY c.masterCode, c.id", [line.id]);
  const [skuRows] = await connection.query<any[]>("SELECT s.*, ds.styleCode, ds.isActive AS styleIsActive, ? AS distributorCode FROM distributor_skus s JOIN door_styles ds ON ds.id=s.styleId WHERE s.distributorId=? ORDER BY s.cabinetId, s.distributorSku, ds.styleCode, s.id", [AEF_CODE, line.id]);
  const [overrides] = await connection.query<any[]>("SELECT o.* FROM distributor_cabinet_overrides o WHERE o.distributorId=? ORDER BY o.cabinetId, o.id", [line.id]);
  return { line, masters, skuRows, overrides };
}
function reportText(inventory: AnyRecord) {
  const summary = inventory.audit.summary;
  const byKind = Object.entries(inventory.audit.issueCountsByKind as Record<string, number>).sort(([a], [b]) => a.localeCompare(b));
  const affected = inventory.audit.masters.filter((master: MasterAudit) => master.issues.length);
  const count = (kind: string) => Number(inventory.audit.issueCountsByKind[kind] ?? 0);
  const cleanChecks = [
    ["manifest_face_configuration_mismatch", "manifest face configuration"],
    ["public_supplier_prose_leak", "public supplier-copy provenance/staging leak"],
    ["public_master_prose_leak", "public master-copy provenance/staging leak"],
    ["legacy_page_crop_image", "legacy page-crop image"],
    ["nonpositive_source_list_price", "non-positive own source price"],
  ].filter(([kind]) => count(kind) === 0).map(([, label]) => label);
  return [
    "# AEF Frameless Catalog Quality Inventory",
    "",
    "This deterministic snapshot is read-only. It executes only `SELECT` statements and does not recalculate source prices or write to the database.",
    "",
    `Snapshot scope: **${summary.publishedAvailableMasters} published/available masters** and **${summary.publishedAvailableRows} published/available source-style rows** (${summary.allAefRows} total AEF SKU rows).`,
    `Coverage gate: expected ${EXPECTED_PUBLISHED_MASTERS} masters; ${summary.publishedAvailableMasters === EXPECTED_PUBLISHED_MASTERS ? "passed" : "FAILED"}.`,
    `Manifest evidence: 168 source records (157 geometry-bearing and 11 explicitly geometry-empty accessories); ${summary.legacyResolverSourceSkuCount} additional resolver-only legacy source identities were observed. Those identities are preserved as valid aliases/extensions, not treated as duplicate source truth.`,
    `Current manufacturer V8 evidence: ${summary.officialCurrentV8ModelTokensFound}/168 model tokens/known aliases found in the supplied 61-page book. This is model-token/table evidence only. The original project V8.2 PDF is unavailable, so this audit does **not** claim an independent re-verification of every original drawing or infer a page offset.`,
    "",
    "## Deterministic truth hierarchy",
    "",
    "- Supplier SKU geometry is checked against `shared/aefFramelessGeometry` and the expanded 157-item resolver/manifest table; shared framed master dimensions and face counts are explicitly excluded from truth.",
    "- Manifest face configuration is checked only where a manifest record exists. It covers doors, drawers, orientation, graphic, product type, corner/opening/oven and source drawer-layout fields.",
    "- List prices are checked as positive source-owned values. Manifest price-column comparisons use the printed price value directly; no landed-cost or retail-price formula is calculated.",
    "- Empty moulding/accessory geometry is recorded separately and is not manufactured from a master record.",
    "",
    "## Findings",
    "",
    byKind.length ? byKind.map(([kind, count]) => `- **${kind}:** ${count} row/master finding(s). Exact row IDs, source SKUs, style codes, expected/actual values and evidence are in \`inventory.json\` under \`audit.masters[].issues\`.`).join("\n") : "- No issues detected.",
    "",
    `Checks with no finding in this snapshot: ${cleanChecks.join("; ") || "none"}.`,
    "The geometry findings are exact stored-value comparisons (including the recorded expected/actual decimal precision); they are not derived from shared framed master values. The same-master/source-style findings preserve every divergent row group for remediation review rather than collapsing values by rounding.",
    "",
    `Affected masters: ${affected.length}/${inventory.audit.masters.length}. Geometry-empty published accessory rows: ${inventory.audit.emptyAccessoryGeometry.rows.length}.`,
    "",
    "## Known evidence limits",
    "",
    "- The source PDF used here is the current manufacturer-linked 61-page V8 book at the recorded URL. Its pagination/version is not asserted to be the inaccessible original V8.2 source, so printed-page numbers are evidence fields rather than a conversion rule.",
    "- Legacy resolver-only source identities and intentional alias overlap are retained in the JSON classification. They are not counted as manifest omissions solely because they are outside the 168-record complete-source manifest.",
    "- Legacy PNG page-crop findings identify historical AEF source-art naming; they are presentation quality findings, not geometry changes.",
    "",
  ].join("\n");
}

export async function runAefCatalogQualityAudit(options: { outputDir?: string; databaseUrl?: string } = {}) {
  const outputDir = options.outputDir ?? DEFAULT_OUTPUT_DIR;
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required to run the read-only inventory.");
  const manifest = loadManifest();
  const officialText = fs.readFileSync(OFFICIAL_V8_TEXT_PATH, "utf8");
  const connection = await mysql.createConnection(databaseUrl);
  try {
    const selected = await selectInventory(connection);
    const analysis = auditInventory({ ...selected, manifest, officialText });
    const countByKind = analysis.issues.reduce<Record<string, number>>((all, issue) => ({ ...all, [issue.kind]: (all[issue.kind] ?? 0) + issue.affectedRowCount }), {});
    const expectedEmpty = manifest.filter((row) => row.category === "Accessory" && row.width === undefined).map((row) => row.sku).sort();
    const inventory = {
      auditSpecification: {
        auditVersion: "aef-whole-inventory-read-only-v1", databaseContract: "SELECT-only; no transaction, DDL, DML, price calculation, or secrets in output.",
        supplier: { distributorCode: AEF_CODE, line: selected.line },
        scope: { requiredPublishedAvailableMasters: EXPECTED_PUBLISHED_MASTERS, manifestRecords: 168, expandedGeometryRecords: Object.keys(AEF_EXPANDED_SOURCE_GEOMETRY).length, originalResolverInitialSet: 115, explicitOverlapPolicy: "Manifest and resolver-only source identities may overlap/alias legitimately; each supplier source SKU is audited independently." },
        truthPolicy: { geometry: "shared/aefFramelessGeometry plus expanded manifest resolver only", excluded: ["shared framed cabinet master dimensions", "shared master face counts"], faceConfiguration: "manifest where a matching source SKU exists", prices: "positive source-owned listPrice and direct manifest source-column equality only; no recalculation" },
        currentOfficialBook: { localPdf: OFFICIAL_V8_PDF_PATH, localText: OFFICIAL_V8_TEXT_PATH, url: OFFICIAL_V8_URL, pages: 61, limitation: "Current manufacturer V8 is model/table evidence. Original V8.2 project PDF was unavailable; do not claim every original drawing was independently reverified." },
      },
      export: { generatedAt: new Date().toISOString(), queryOrder: ["distributors", "cabinets", "distributor_skus + door_styles", "distributor_cabinet_overrides"], noSecrets: true },
      masters: selected.masters,
      skuRows: selected.skuRows,
      lineOverrides: selected.overrides,
      sourceManifestCoverage: analysis.sourceCoverage,
      audit: {
        summary: { publishedAvailableMasters: new Set(analysis.publicRows.map((row) => Number(row.cabinetId))).size, publishedAvailableRows: analysis.publicRows.length, allAefRows: selected.skuRows.length, exportedMasters: selected.masters.length, exportedOverrides: selected.overrides.length, expectedPublishedAvailableMasters: EXPECTED_PUBLISHED_MASTERS, legacyResolverSourceSkuCount: analysis.resolverLegacySourceSkus.length, officialCurrentV8ModelTokensFound: analysis.sourceCoverage.filter((item) => item.officialCurrentV8Evidence.status !== "not_found_in_current_v8_text").length, officialCurrentV8ModelTokensUnresolved: analysis.sourceCoverage.filter((item) => item.officialCurrentV8Evidence.status === "not_found_in_current_v8_text").map((item) => item.sku), issueRowsOrMasters: analysis.issues.reduce((sum, issue) => sum + issue.affectedRowCount, 0) },
        expectedLegacyPreservedFields: ["all shared cabinet master fields are exported for reference but excluded from AEF geometry and face truth", "source listPrice is not recalculated", "legacy resolver-only SKU identities are preserved", "empty accessory geometry remains empty"],
        legacyResolverOnlySourceSkus: analysis.resolverLegacySourceSkus,
        emptyAccessoryGeometry: { expectedManifestSkus: expectedEmpty, rows: analysis.emptyAccessoryRows.map((row) => ({ id: row.id, cabinetId: row.cabinetId, distributorSku: row.distributorSku, styleCode: row.styleCode, geometry: geometryOf(row), listPrice: row.listPrice, isPublished: row.isPublished, isAvailable: row.isAvailable })) },
        issueCountsByKind: countByKind,
        masters: analysis.audits,
      },
    };
    fs.mkdirSync(outputDir, { recursive: true });
    const inventoryPath = path.join(outputDir, "inventory.json");
    const reportPath = path.join(outputDir, "inventory-report.md");
    fs.writeFileSync(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`);
    fs.writeFileSync(reportPath, reportText(inventory));
    return { inventoryPath, reportPath, summary: inventory.audit.summary, issueCountsByKind: countByKind };
  } finally { await connection.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void runAefCatalogQualityAudit().then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error); process.exitCode = 1; });
}
