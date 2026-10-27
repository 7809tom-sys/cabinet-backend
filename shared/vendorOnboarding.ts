// Exception-only vendor onboarding.
//
// A vendor spreadsheet is matched to the uniform cabinet nomenclature. A row
// whose SKU is exactly one master (or one known alias of that master) keeps
// the master's dimensions, type, and description. The vendor only supplies
// distributor, style, color, and price. Anything else — an unknown SKU, two
// possible masters, or a matched row missing one of those four — stays on a
// short flagged list. A flagged row the vendor finishes is not a verified
// master: the caller opens it in the public cabinet-conflict review.

import { RESOLVED_FIELDS_LABEL } from "./cabinetConflictFlags";
import { normalizeCode } from "./cabinetCodeMatch";
import { MAX_PRICE, newMasterCodeFrom, parsePrice, splitDelimited } from "./vendorCodeUpload";

export const MAX_ONBOARDING_ROWS = 5000;

export const SPECIAL_FIELDS = ["distributorName", "style", "color", "price"] as const;
export type SpecialField = (typeof SPECIAL_FIELDS)[number];

export type OnboardingFlagReason = "unknown_sku" | "ambiguous" | "missing_special";
export type OnboardingRowStatus = "matched" | "flagged" | "completed";
export type MatchVia = "master" | "alias";

export interface OnboardingInputRow {
  rowNumber: number;
  sku: string;
  distributorName?: string | null;
  style?: string | null;
  color?: string | null;
  price?: number | string | null;
  category?: string | null;
  subCategory?: string | null;
  width?: number | string | null;
  height?: number | string | null;
  depth?: number | string | null;
  description?: string | null;
  numberOfDoors?: number | string | null;
  numberOfDrawers?: number | string | null;
}

export interface OnboardingMaster {
  id: number;
  masterCode: string;
  sku?: string | null;
  vendorSku?: string | null;
  altSku1?: string | null;
  altSku2?: string | null;
  altSku3?: string | null;
  description?: string | null;
  category?: string | null;
  subCategory?: string | null;
  width?: number | string | null;
  height?: number | string | null;
  depth?: number | string | null;
  numberOfDoors?: number | null;
  numberOfDrawers?: number | null;
  placementType?: string | null;
  conflictStatus?: string | null;
  /** Distributors that already sell this cabinet. Used only for trim. */
  supplierIds?: number[];
}

export interface OnboardingAliasLink {
  alias: string;
  cabinetId?: number | null;
  masterCode?: string | null;
}

export interface OnboardingStyle {
  id: number;
  styleCode: string;
  ourName: string;
  aliasName?: string | null;
  distributorName?: string | null;
  color?: string | null;
  doorStyle?: string | null;
}

export interface InheritedCabinet {
  cabinetId: number;
  masterCode: string;
  description: string | null;
  category: string | null;
  subCategory: string | null;
  width: string | null;
  height: string | null;
  depth: string | null;
  numberOfDoors: number | null;
  numberOfDrawers: number | null;
}

export interface OnboardingDraft {
  category: string | null;
  subCategory: string | null;
  width: number | null;
  height: number | null;
  depth: number | null;
  description: string | null;
  numberOfDoors: number | null;
  numberOfDrawers: number | null;
}

export interface PlannedOnboardingRow {
  rowNumber: number;
  sku: string;
  normalizedSku: string;
  status: OnboardingRowStatus;
  flagReason: OnboardingFlagReason | null;
  missingFields: SpecialField[];
  needsFullDetails: boolean;
  cabinetId: number | null;
  masterCode: string | null;
  matchedVia: MatchVia | null;
  candidateMasterCodes: string[];
  distributorName: string | null;
  style: string | null;
  color: string | null;
  price: number | null;
  styleId: number | null;
  inherited: InheritedCabinet | null;
  draft: OnboardingDraft;
  trimSupplierId: number | null;
  trimHeld: boolean;
  message: string;
}

export interface OnboardingSummary {
  total: number;
  matched: number;
  flagged: number;
  completed: number;
  trimHeld: number;
}

const NINE_INCH_BASE_CODES = new Set([
  "B9", "B09", "BT9", "BT09", "BFH9", "BFH09", "TB9", "TB09", "FHB9", "FHB09", "FH9", "FHBO9", "TBO9",
]);

const HEADER_WORDS: Record<string, readonly string[]> = {
  sku: ["sku", "code", "nomenclature", "item", "itemcode", "itemnumber", "itemno", "partnumber", "partno", "part", "cabinet", "cabinetcode", "model", "mastercode", "alias", "vendorsku", "distributorsku", "productcode", "product"],
  price: ["price", "listprice", "list", "msrp", "unitprice", "sellprice", "sell", "retail"],
  style: ["style", "door", "doorname", "doorstyle", "stylename"],
  color: ["color", "colour", "finish", "doorcolor", "doorfinish", "stain", "staincolor"],
  distributorName: ["distributor", "distributorname", "vendor", "vendorname", "supplier", "suppliername", "linename"],
  category: ["category", "type", "cabinettype", "producttype"],
  subCategory: ["subcategory", "subtype"],
  width: ["width", "widthin"],
  height: ["height", "heightin"],
  depth: ["depth", "depthin"],
  description: ["description", "desc", "cabinetname"],
  numberOfDoors: ["doors", "numberofdoors", "doorcount"],
  numberOfDrawers: ["drawers", "numberofdrawers", "drawercount"],
};

const HEADER_FIELDS = Object.keys(HEADER_WORDS);

function headerKey(cell: string): string {
  return (cell ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function text(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

function numeric(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(/["\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDimension(value: number | string | null | undefined): number | null {
  const parsed = numeric(value);
  if (parsed == null || parsed <= 0 || parsed > 1000) return null;
  return Math.round(parsed * 1000) / 1000;
}

function parseCount(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 20) return null;
  return parsed;
}

function asTextDimension(value: number | string | null | undefined): string | null {
  if (value == null || value === "") return null;
  return String(value);
}

/** 9" base cabinets are tray bases or full-height bases and never have drawers. */
export function isNineInchBase(input: {
  width?: number | string | null;
  category?: string | null;
  subCategory?: string | null;
  masterCode?: string | null;
  placementType?: string | null;
  description?: string | null;
}): boolean {
  const code = normalizeCode(input.masterCode ?? "");
  if (NINE_INCH_BASE_CODES.has(code)) return true;
  const width = numeric(input.width);
  const nineWide = width != null && Math.abs(width - 9) <= 0.05;
  if (!nineWide) return false;
  const family = `${input.category ?? ""} ${input.placementType ?? ""}`.toLowerCase();
  const detail = `${input.subCategory ?? ""} ${input.description ?? ""}`.toLowerCase();
  if (family.includes("wall") || family.includes("tall") || family.includes("vanity")) return false;
  return family.includes("base") || /tray|full[\s-]?height/.test(detail);
}

export function enforcedDrawerCount(input: {
  width?: number | string | null;
  category?: string | null;
  subCategory?: string | null;
  masterCode?: string | null;
  placementType?: string | null;
  description?: string | null;
  numberOfDrawers?: number | null;
}): number | null {
  if (isNineInchBase(input)) return 0;
  return input.numberOfDrawers ?? null;
}

/** Trim is not moved onto another supplier's cabinet line. */
export function isTrimItem(input: {
  category?: string | null;
  subCategory?: string | null;
  description?: string | null;
  masterCode?: string | null;
}): boolean {
  return /trim|molding|moulding|crown|valance|toe.?kick/i.test(
    `${input.category ?? ""} ${input.subCategory ?? ""} ${input.description ?? ""} ${input.masterCode ?? ""}`,
  );
}

export function trimOwnership(input: {
  category?: string | null;
  subCategory?: string | null;
  description?: string | null;
  masterCode?: string | null;
  uploadingDistributorId: number;
  existingSupplierIds?: number[] | null;
}): { supplierId: number | null; held: boolean } {
  if (!isTrimItem(input)) return { supplierId: input.uploadingDistributorId, held: false };
  const suppliers = Array.from(new Set((input.existingSupplierIds ?? []).filter((id) => Number.isInteger(id))));
  if (suppliers.length === 1 && suppliers[0] !== input.uploadingDistributorId) {
    return { supplierId: suppliers[0], held: true };
  }
  if (suppliers.length > 1 && !suppliers.includes(input.uploadingDistributorId)) {
    return { supplierId: null, held: true };
  }
  return { supplierId: input.uploadingDistributorId, held: false };
}

export function placementForCategory(category: string): "base" | "wall" | "tall" | "accessory" {
  const catLower = category.toLowerCase();
  if (catLower.includes("wall")) return "wall";
  if (catLower.includes("tall") || catLower.includes("pantry") || catLower.includes("utility") || catLower.includes("oven")) return "tall";
  if (catLower.includes("accessory") || catLower.includes("trim") || catLower.includes("molding") || catLower.includes("filler")) return "accessory";
  return "base";
}

export function vendorOnboardingConflictReason(input: {
  sku: string;
  distributorName: string;
  style: string;
  color: string;
  price: number;
}): string {
  return [
    `Issue: ${input.sku} was not on the master nomenclature. The vendor supplied type, dimensions, doors, and drawers during onboarding. Those values are unverified.`,
    `Current value: ${input.distributorName}; ${input.style}; ${input.color}; $${input.price.toFixed(2)}`,
    "Source: Vendor onboarding spreadsheet. Not a verified master item.",
    "Needed: Administrator approval before this item is treated as master nomenclature.",
    `${RESOLVED_FIELDS_LABEL} description, category, width, height, depth, numberOfDoors, numberOfDrawers`,
  ].join("\n");
}

function aliasTokens(value: string | null | undefined): string[] {
  if (!value) return [];
  return value.split(";").map((part) => part.trim()).filter(Boolean);
}

function usableMaster(master: OnboardingMaster): boolean {
  if (!master.masterCode || master.masterCode.toUpperCase().startsWith("ARCHIVE-")) return false;
  return master.conflictStatus !== "conflict";
}

function buildIndex(masters: OnboardingMaster[], links: OnboardingAliasLink[]) {
  const usable = masters.filter(usableMaster);
  const byId = new Map(usable.map((master) => [master.id, master]));
  const byNormMaster = new Map<string, OnboardingMaster[]>();
  for (const master of usable) {
    const key = normalizeCode(master.masterCode);
    if (!key) continue;
    const list = byNormMaster.get(key) ?? [];
    list.push(master);
    byNormMaster.set(key, list);
  }
  const index = new Map<string, Map<number, MatchVia>>();
  const add = (code: string | null | undefined, cabinetId: number, via: MatchVia) => {
    if (!byId.has(cabinetId)) return;
    const canon = normalizeCode(code ?? "");
    if (!canon) return;
    const bucket = index.get(canon) ?? new Map<number, MatchVia>();
    const previous = bucket.get(cabinetId);
    if (previous !== "master") bucket.set(cabinetId, via);
    index.set(canon, bucket);
  };
  for (const master of usable) {
    add(master.masterCode, master.id, "master");
    for (const field of [master.sku, master.vendorSku, master.altSku1, master.altSku2, master.altSku3]) {
      for (const token of aliasTokens(field)) add(token, master.id, "alias");
    }
  }
  for (const link of links) {
    const tokens = aliasTokens(link.alias);
    if (link.cabinetId != null) {
      for (const token of tokens) add(token, link.cabinetId, "alias");
      continue;
    }
    if (!link.masterCode) continue;
    for (const target of byNormMaster.get(normalizeCode(link.masterCode)) ?? []) {
      for (const token of tokens) add(token, target.id, "alias");
    }
  }
  return { index, byId };
}

function loose(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function styleLabels(style: OnboardingStyle): string[] {
  return [style.ourName, style.aliasName, style.distributorName, style.styleCode, style.doorStyle]
    .filter((value): value is string => Boolean(value?.trim()));
}

export function resolveOnboardingStyle(
  wanted: string | null,
  styles: OnboardingStyle[],
  color: string | null,
): OnboardingStyle | null {
  const name = wanted?.trim() ?? "";
  if (!name) return null;
  const exact = styles.filter((style) => styleLabels(style).some((label) => label.trim().toLowerCase() === name.toLowerCase()));
  let pool = exact;
  if (pool.length === 0) {
    const key = loose(name);
    if (!key) return null;
    pool = styles.filter((style) => styleLabels(style).some((label) => loose(label) === key));
  }
  if (pool.length === 1) return pool[0];
  if (pool.length > 1 && color?.trim()) {
    const colorKey = loose(color);
    const narrowed = pool.filter((style) => style.color && loose(style.color) === colorKey);
    if (narrowed.length === 1) return narrowed[0];
  }
  return null;
}

function readPrice(value: number | string | null | undefined): { price: number | null; invalid: boolean } {
  if (value == null) return { price: null, invalid: false };
  if (typeof value === "string" && value.trim() === "") return { price: null, invalid: false };
  const price = parsePrice(value);
  return price == null ? { price: null, invalid: true } : { price, invalid: false };
}

function draftFrom(row: OnboardingInputRow): OnboardingDraft {
  return {
    category: text(row.category),
    subCategory: text(row.subCategory),
    width: parseDimension(row.width),
    height: parseDimension(row.height),
    depth: parseDimension(row.depth),
    description: text(row.description),
    numberOfDoors: parseCount(row.numberOfDoors),
    numberOfDrawers: parseCount(row.numberOfDrawers),
  };
}

function inheritedFrom(master: OnboardingMaster): InheritedCabinet {
  return {
    cabinetId: master.id,
    masterCode: master.masterCode,
    description: master.description ?? null,
    category: master.category ?? null,
    subCategory: master.subCategory ?? null,
    width: asTextDimension(master.width),
    height: asTextDimension(master.height),
    depth: asTextDimension(master.depth),
    numberOfDoors: master.numberOfDoors ?? null,
    numberOfDrawers: enforcedDrawerCount(master),
  };
}

function fieldLabel(field: SpecialField): string {
  if (field === "distributorName") return "distributor name";
  return field;
}

export function summarizeOnboarding(rows: PlannedOnboardingRow[]): OnboardingSummary {
  return {
    total: rows.length,
    matched: rows.filter((row) => row.status === "matched").length,
    flagged: rows.filter((row) => row.status === "flagged").length,
    completed: rows.filter((row) => row.status === "completed").length,
    trimHeld: rows.filter((row) => row.trimHeld).length,
  };
}

export interface PlanOnboardingInput {
  rows: OnboardingInputRow[];
  masters: OnboardingMaster[];
  aliases: OnboardingAliasLink[];
  styles: OnboardingStyle[];
  lineName: string;
  lineId: number;
}

export function planOnboarding(input: PlanOnboardingInput): PlannedOnboardingRow[] {
  const { index, byId } = buildIndex(input.masters, input.aliases);
  const planned: PlannedOnboardingRow[] = [];
  for (const row of input.rows) {
    const sku = row.sku?.trim() ?? "";
    const normalizedSku = normalizeCode(sku);
    const draft = draftFrom(row);
    const priceRead = readPrice(row.price);
    const distributorName = text(row.distributorName) ?? text(input.lineName);
    const styleText = text(row.style);
    const preliminaryColor = text(row.color);
    const resolvedStyle = resolveOnboardingStyle(styleText, input.styles, preliminaryColor);
    const color = preliminaryColor ?? text(resolvedStyle?.color);
    const specials: Record<SpecialField, string | number | null> = {
      distributorName,
      style: styleText,
      color,
      price: priceRead.price,
    };
    const missingFields = SPECIAL_FIELDS.filter((field) => specials[field] == null);

    const base: PlannedOnboardingRow = {
      rowNumber: row.rowNumber,
      sku: sku.slice(0, 128),
      normalizedSku,
      status: "flagged",
      flagReason: null,
      missingFields,
      needsFullDetails: false,
      cabinetId: null,
      masterCode: null,
      matchedVia: null,
      candidateMasterCodes: [],
      distributorName,
      style: styleText,
      color,
      price: priceRead.price,
      styleId: resolvedStyle?.id ?? null,
      inherited: null,
      draft,
      trimSupplierId: null,
      trimHeld: false,
      message: "",
    };

    const hits = normalizedSku ? index.get(normalizedSku) : undefined;
    if (!normalizedSku || !hits || hits.size === 0) {
      planned.push({
        ...base,
        flagReason: "unknown_sku",
        needsFullDetails: true,
        message: normalizedSku
          ? "This SKU does not match a master item or a known alias."
          : "SKU is empty.",
      });
      continue;
    }
    if (hits.size > 1) {
      const candidates = Array.from(hits.keys())
        .map((id) => byId.get(id)!)
        .sort((left, right) => left.masterCode.localeCompare(right.masterCode));
      planned.push({
        ...base,
        flagReason: "ambiguous",
        needsFullDetails: true,
        candidateMasterCodes: candidates.map((candidate) => candidate.masterCode),
        message: `This SKU matches more than one item (${candidates.map((candidate) => candidate.masterCode).join(", ")}). It was not guessed.`,
      });
      continue;
    }

    const [[cabinetId, via]] = Array.from(hits.entries());
    const master = byId.get(cabinetId)!;
    const inherited = inheritedFrom(master);
    const trim = trimOwnership({
      category: master.category,
      subCategory: master.subCategory,
      description: master.description,
      masterCode: master.masterCode,
      uploadingDistributorId: input.lineId,
      existingSupplierIds: master.supplierIds,
    });
    const matched: PlannedOnboardingRow = {
      ...base,
      cabinetId: master.id,
      masterCode: master.masterCode,
      matchedVia: via,
      inherited,
      trimSupplierId: trim.supplierId,
      trimHeld: trim.held,
    };
    if (missingFields.length > 0 || priceRead.invalid) {
      const fields = priceRead.invalid && !missingFields.includes("price")
        ? [...missingFields, "price" as const]
        : missingFields;
      const others = fields.filter((field) => field !== "price").map(fieldLabel);
      const priceNote = priceRead.invalid ? "Price is not a valid amount." : null;
      const missingNote = others.length > 0
        ? `Missing ${others.join(", ")}.`
        : priceRead.invalid
          ? null
          : `Missing ${fields.map(fieldLabel).join(", ")}.`;
      planned.push({
        ...matched,
        status: "flagged",
        flagReason: "missing_special",
        missingFields: fields,
        needsFullDetails: false,
        message: [priceNote, missingNote, `The cabinet details come from ${master.masterCode}.`]
          .filter(Boolean)
          .join(" "),
      });
      continue;
    }
    planned.push({
      ...matched,
      status: "matched",
      flagReason: null,
      missingFields: [],
      message: trim.held
        ? `Matched ${master.masterCode}. Trim stays with its own supplier and was not copied onto this line.`
        : `Matched ${master.masterCode}. Dimensions, type, and description come from the master nomenclature.`,
    });
  }
  return planned;
}

export interface OnboardingDetails {
  distributorName?: string | null;
  style?: string | null;
  color?: string | null;
  price?: number | string | null;
  category?: string | null;
  subCategory?: string | null;
  width?: number | string | null;
  height?: number | string | null;
  depth?: number | string | null;
  description?: string | null;
  numberOfDoors?: number | string | null;
  numberOfDrawers?: number | string | null;
}

export interface StoredOnboardingRow {
  status: OnboardingRowStatus;
  flagReason: OnboardingFlagReason | null;
  missingFields: SpecialField[];
  sku: string;
  cabinetId: number | null;
  masterCode: string | null;
  matchedVia: MatchVia | null;
  distributorName: string | null;
  style: string | null;
  color: string | null;
  price: number | null;
  styleId: number | null;
  inherited: InheritedCabinet | null;
  draft: OnboardingDraft;
  trimHeld: boolean;
  trimSupplierId: number | null;
}

export interface ReviewCabinetDraft {
  masterCode: string;
  description: string;
  category: string;
  subCategory: string | null;
  width: number;
  height: number;
  depth: number;
  numberOfDoors: number;
  numberOfDrawers: number;
  placementType: "base" | "wall" | "tall" | "accessory";
  conflictReason: string;
}

export type SubmissionOutcome =
  | { ok: false; message: string }
  | {
      ok: true;
      status: OnboardingRowStatus;
      flagReason: OnboardingFlagReason | null;
      missingFields: SpecialField[];
      needsFullDetails: boolean;
      message: string;
      distributorName: string | null;
      style: string | null;
      color: string | null;
      price: number | null;
      styleId: number | null;
      draft: OnboardingDraft;
      opensReview: boolean;
      review: ReviewCabinetDraft | null;
      trimHeld: boolean;
      trimSupplierId: number | null;
    };

function mergeDraft(current: OnboardingDraft, details: OnboardingDetails): OnboardingDraft {
  return {
    category: details.category !== undefined ? text(details.category) : current.category,
    subCategory: details.subCategory !== undefined ? text(details.subCategory) : current.subCategory,
    width: details.width !== undefined ? parseDimension(details.width) : current.width,
    height: details.height !== undefined ? parseDimension(details.height) : current.height,
    depth: details.depth !== undefined ? parseDimension(details.depth) : current.depth,
    description: details.description !== undefined ? text(details.description) : current.description,
    numberOfDoors: details.numberOfDoors !== undefined ? parseCount(details.numberOfDoors) : current.numberOfDoors,
    numberOfDrawers: details.numberOfDrawers !== undefined ? parseCount(details.numberOfDrawers) : current.numberOfDrawers,
  };
}

export function applyFlaggedSubmission(
  row: StoredOnboardingRow,
  details: OnboardingDetails,
  context: { styles: OnboardingStyle[]; lineName: string; lineId: number },
): SubmissionOutcome {
  if (row.status !== "flagged") return { ok: false, message: "This row is not waiting for details." };
  const priceRead = details.price !== undefined ? readPrice(details.price) : { price: row.price, invalid: false };
  if (priceRead.invalid) return { ok: false, message: "Price is not a valid amount." };
  const distributorName = details.distributorName !== undefined
    ? text(details.distributorName) ?? text(context.lineName)
    : row.distributorName ?? text(context.lineName);
  const style = details.style !== undefined ? text(details.style) : row.style;
  const explicitColor = details.color !== undefined ? text(details.color) : text(row.color);
  const resolvedStyle = resolveOnboardingStyle(style, context.styles, explicitColor);
  const color = explicitColor ?? text(resolvedStyle?.color);
  const draft = mergeDraft(row.draft, details);
  const missingFields = SPECIAL_FIELDS.filter((field) => {
    const value = { distributorName, style, color, price: priceRead.price }[field];
    return value == null;
  });
  const styleId = resolvedStyle?.id ?? null;
  const shared = {
    distributorName,
    style,
    color,
    price: priceRead.price,
    styleId,
    draft,
    trimHeld: row.trimHeld,
    trimSupplierId: row.trimSupplierId,
  };

  if (row.flagReason === "missing_special") {
    if (missingFields.length > 0) {
      return {
        ok: true,
        status: "flagged",
        flagReason: "missing_special",
        missingFields,
        needsFullDetails: false,
        message: `Still missing ${missingFields.map(fieldLabel).join(", ")}.`,
        opensReview: false,
        review: null,
        ...shared,
      };
    }
    if (style && styleId == null) {
      return { ok: false, message: `Style "${style}" is not one door on this line. Use the line's door name.` };
    }
    return {
      ok: true,
      status: "matched",
      flagReason: null,
      missingFields: [],
      needsFullDetails: false,
      message: row.masterCode
        ? `Matched ${row.masterCode}. Dimensions, type, and description come from the master nomenclature.`
        : "Matched the master nomenclature.",
      opensReview: false,
      review: null,
      ...shared,
    };
  }

  const stillNeeded: string[] = [];
  if (!distributorName) stillNeeded.push("distributor name");
  if (!style) stillNeeded.push("style");
  if (!color) stillNeeded.push("color");
  if (priceRead.price == null) stillNeeded.push("price");
  if (!draft.category) stillNeeded.push("type");
  if (draft.width == null) stillNeeded.push("width");
  if (draft.height == null) stillNeeded.push("height");
  if (draft.depth == null) stillNeeded.push("depth");
  if (!draft.description) stillNeeded.push("description");
  if (draft.numberOfDoors == null) stillNeeded.push("doors");
  if (draft.numberOfDrawers == null) stillNeeded.push("drawers");
  if (stillNeeded.length > 0) {
    return {
      ok: true,
      status: "flagged",
      flagReason: row.flagReason,
      missingFields,
      needsFullDetails: true,
      message: `Still needs ${stillNeeded.join(", ")}.`,
      opensReview: false,
      review: null,
      ...shared,
    };
  }

  const nine = isNineInchBase({
    width: draft.width,
    category: draft.category,
    subCategory: draft.subCategory,
    description: draft.description,
    masterCode: row.sku,
  });
  if (nine && (draft.numberOfDrawers ?? 0) > 0) {
    return { ok: false, message: "9-inch base cabinets are tray or full-height and never have drawers." };
  }
  if (style && styleId == null) {
    return { ok: false, message: `Style "${style}" is not one door on this line. Use the line's door name.` };
  }
  const masterCode = newMasterCodeFrom(row.sku);
  if (!masterCode) return { ok: false, message: `"${row.sku}" cannot be stored as a cabinet code.` };
  const drawers = nine ? 0 : draft.numberOfDrawers!;
  const review: ReviewCabinetDraft = {
    masterCode,
    description: draft.description!,
    category: draft.category!,
    subCategory: draft.subCategory,
    width: draft.width!,
    height: draft.height!,
    depth: draft.depth!,
    numberOfDoors: draft.numberOfDoors!,
    numberOfDrawers: drawers,
    placementType: placementForCategory(draft.category!),
    conflictReason: vendorOnboardingConflictReason({
      sku: row.sku,
      distributorName: distributorName!,
      style: style!,
      color: color!,
      price: priceRead.price!,
    }),
  };
  return {
    ok: true,
    status: "completed",
    flagReason: null,
    missingFields: [],
    needsFullDetails: false,
    message: "Submitted for administrator review. This is not a verified master item yet, and it stays usable while the conflict review is open.",
    opensReview: true,
    review,
    ...shared,
    draft: { ...draft, numberOfDrawers: drawers },
  };
}

export function parseOnboardingGrid(grid: string[][]): { rows: OnboardingInputRow[]; notes: string[] } {
  const notes: string[] = [];
  const clean = grid.map((cells) => cells.map((cell) => String(cell ?? "").trim()));
  const first = clean.findIndex((cells) => cells.some((cell) => cell !== ""));
  if (first === -1) return { rows: [], notes };
  const header = clean[first];
  const idx: Record<string, number> = {};
  header.forEach((cell, column) => {
    const key = headerKey(cell);
    if (!key) return;
    for (const field of HEADER_FIELDS) {
      if (idx[field] == null && HEADER_WORDS[field].includes(key)) {
        idx[field] = column;
        return;
      }
    }
  });
  const headerDetected = idx.sku != null && (idx.price != null || idx.style != null || idx.color != null);
  const dataStart = headerDetected ? first + 1 : first;
  if (!headerDetected) {
    idx.sku = 0;
    idx.distributorName = 1;
    idx.style = 2;
    idx.color = 3;
    idx.price = 4;
    notes.push("No header row found. Columns were read as SKU, distributor, style, color, price.");
  }
  const rows: OnboardingInputRow[] = [];
  for (let index = dataStart; index < clean.length; index += 1) {
    const cells = clean[index];
    if (!cells.some((cell) => cell !== "")) continue;
    const read = (field: string) => {
      const column = idx[field];
      return column == null ? null : cells[column] ?? "";
    };
    rows.push({
      rowNumber: index + 1,
      sku: read("sku") ?? "",
      distributorName: read("distributorName"),
      style: read("style"),
      color: read("color"),
      price: read("price"),
      category: read("category"),
      subCategory: read("subCategory"),
      width: read("width"),
      height: read("height"),
      depth: read("depth"),
      description: read("description"),
      numberOfDoors: read("numberOfDoors"),
      numberOfDrawers: read("numberOfDrawers"),
    });
    if (rows.length >= MAX_ONBOARDING_ROWS) {
      notes.push(`Only the first ${MAX_ONBOARDING_ROWS} rows can be imported at once.`);
      break;
    }
  }
  return { rows, notes };
}

export function parseOnboardingText(textValue: string): { rows: OnboardingInputRow[]; notes: string[] } {
  return parseOnboardingGrid(splitDelimited(textValue ?? ""));
}

export { MAX_PRICE };
