// Distributor-facing purchase-order lines.
//
// Cabinet Dealz shows shoppers a white-label catalog name. The distributor's
// order email, CSV, and any other PO document must use the code and name that
// distributor already sells: distributor_skus.distributorSku plus
// supplierCabinetName / supplierDescription, or vendor_products.vendorSku plus
// name for hardware. Door style uses door_styles.distributorName. The company
// on the PO uses distributors.brandName, never the neutral white-label line name.

import { normalizeCode } from "./cabinetCodeMatch";

export const NO_DISTRIBUTOR_SKU_MAPPED = "no distributor SKU mapped";

export type DistributorSkuRecord = {
  distributorId: number;
  cabinetId: number | null;
  styleId: number;
  distributorSku: string;
  supplierCabinetName?: string | null;
  supplierDescription?: string | null;
  isAvailable?: boolean | null;
  status?: string | null;
};

export type VendorProductRecord = {
  id: number;
  distributorId: number;
  vendorSku: string;
  name: string;
  description?: string | null;
};

export type DistributorStyleRecord = {
  id: number;
  distributorName?: string | null;
  doorStyle?: string | null;
  color?: string | null;
  finish?: string | null;
  aliasName?: string | null;
  ourName?: string | null;
};

export type DistributorPoLineInput = {
  cabinetId?: number | null;
  styleId?: number | null;
  masterCode?: string | null;
  rawCode?: string | null;
  /**
   * Shopper / Cabinet Dealz description stored on the order line.
   * Resolver reads it only to make sure it is not copied onto the PO.
   */
  description?: string | null;
  qty: number;
  unitPrice?: number | null;
  doorStyle?: string | null;
  distributorSku?: string | null;
  productKind?: string | null;
  vendorProductId?: number | null;
};

export type DistributorPoLineView = {
  qty: number;
  /** Distributor SKU, or the catalog code when nothing mapped. */
  sku: string;
  /** supplierCabinetName, else supplierDescription. The unmapped flag when nothing mapped. */
  distributorItemName: string;
  /** Extra distributor description when it is not already the item name. */
  supplierDescription: string;
  doorStyle: string | null;
  mapped: boolean;
  catalogCode: string;
  unitPrice: number | null;
};

export type IndexedDistributorCatalog = {
  skuByCabinetStyleDistributor: Map<string, DistributorSkuRecord>;
  skusByCabinetDistributor: Map<string, DistributorSkuRecord[]>;
  skusByDistributorCode: Map<string, DistributorSkuRecord[]>;
  vendorById: Map<number, VendorProductRecord>;
  vendorsByDistributorCode: Map<string, VendorProductRecord[]>;
  stylesById: Map<number, DistributorStyleRecord>;
  cabinetIdByCode: Map<string, number>;
};

function clean(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function skuRank(row: DistributorSkuRecord): number {
  let score = 0;
  if (row.isAvailable !== false) score += 4;
  if (row.status == null || row.status === "approved") score += 2;
  if (clean(row.supplierCabinetName) || clean(row.supplierDescription)) score += 1;
  return score;
}

function preferSku(current: DistributorSkuRecord | undefined, row: DistributorSkuRecord): DistributorSkuRecord {
  if (!current || skuRank(row) > skuRank(current)) return row;
  return current;
}

function push<T>(map: Map<string, T[]>, key: string, value: T) {
  const bucket = map.get(key);
  if (bucket) bucket.push(value);
  else map.set(key, [value]);
}

function addCabinetCode(map: Map<string, number>, ambiguous: Set<string>, code: string | null | undefined, cabinetId: number) {
  const key = normalizeCode(code ?? "");
  if (!key || ambiguous.has(key) || !Number.isFinite(cabinetId) || cabinetId <= 0) return;
  const existing = map.get(key);
  if (existing != null && existing !== cabinetId) {
    map.delete(key);
    ambiguous.add(key);
    return;
  }
  map.set(key, cabinetId);
}

export function indexDistributorCatalog(input: {
  skus?: readonly DistributorSkuRecord[];
  vendorProducts?: readonly VendorProductRecord[];
  styles?: readonly DistributorStyleRecord[];
  cabinetCodes?: readonly { cabinetId: number; code: string | null | undefined }[];
  equivalences?: readonly { codeA: string | null | undefined; codeB: string | null | undefined }[];
}): IndexedDistributorCatalog {
  const skuByCabinetStyleDistributor = new Map<string, DistributorSkuRecord>();
  const skusByCabinetDistributor = new Map<string, DistributorSkuRecord[]>();
  const skusByDistributorCode = new Map<string, DistributorSkuRecord[]>();
  for (const row of input.skus ?? []) {
    const code = clean(row.distributorSku);
    if (!code || !row.distributorId) continue;
    if (row.cabinetId != null && row.cabinetId > 0 && row.styleId) {
      const exactKey = `${row.cabinetId}:${row.styleId}:${row.distributorId}`;
      skuByCabinetStyleDistributor.set(exactKey, preferSku(skuByCabinetStyleDistributor.get(exactKey), row));
      push(skusByCabinetDistributor, `${row.cabinetId}:${row.distributorId}`, row);
    }
    push(skusByDistributorCode, `${row.distributorId}:${normalizeCode(code)}`, row);
  }

  const vendorById = new Map<number, VendorProductRecord>();
  const vendorsByDistributorCode = new Map<string, VendorProductRecord[]>();
  for (const row of input.vendorProducts ?? []) {
    if (row.id) vendorById.set(row.id, row);
    const code = clean(row.vendorSku);
    if (code && row.distributorId) push(vendorsByDistributorCode, `${row.distributorId}:${normalizeCode(code)}`, row);
  }

  const stylesById = new Map<number, DistributorStyleRecord>();
  for (const row of input.styles ?? []) stylesById.set(row.id, row);

  const cabinetIdByCode = new Map<string, number>();
  const ambiguous = new Set<string>();
  for (const row of input.cabinetCodes ?? []) addCabinetCode(cabinetIdByCode, ambiguous, row.code, row.cabinetId);
  for (let pass = 0; pass < 4; pass += 1) {
    for (const pair of input.equivalences ?? []) {
      const a = normalizeCode(pair.codeA ?? "");
      const b = normalizeCode(pair.codeB ?? "");
      if (!a || !b || a === b) continue;
      const idA = cabinetIdByCode.get(a);
      const idB = cabinetIdByCode.get(b);
      if (idA && !idB && !ambiguous.has(b)) cabinetIdByCode.set(b, idA);
      else if (idB && !idA && !ambiguous.has(a)) cabinetIdByCode.set(a, idB);
    }
  }

  return {
    skuByCabinetStyleDistributor,
    skusByCabinetDistributor,
    skusByDistributorCode,
    vendorById,
    vendorsByDistributorCode,
    stylesById,
    cabinetIdByCode,
  };
}

function namesFrom(name: string | null | undefined, description: string | null | undefined): { name: string; description: string } {
  const itemName = clean(name);
  const itemDescription = clean(description);
  if (itemName && itemDescription && itemName.toLowerCase() !== itemDescription.toLowerCase()) {
    return { name: itemName, description: itemDescription };
  }
  if (itemName) return { name: itemName, description: "" };
  if (itemDescription) return { name: itemDescription, description: "" };
  return { name: "", description: "" };
}

function doorStyleLabel(line: DistributorPoLineInput, style: DistributorStyleRecord | undefined): string | null {
  const distributorName = clean(style?.distributorName);
  if (distributorName) return distributorName;
  const physical = [style?.doorStyle, style?.color, style?.finish].map((part) => clean(part)).filter(Boolean);
  const unique = Array.from(new Set(physical));
  if (unique.length) return unique.join(" ");
  const stored = clean(line.doorStyle);
  if (!stored) return null;
  const blocked = new Set([style?.aliasName, style?.ourName].map((value) => clean(value).toLowerCase()).filter(Boolean));
  if (blocked.has(stored.toLowerCase())) return null;
  return stored;
}

function catalogCode(line: DistributorPoLineInput): string {
  return clean(line.masterCode) || clean(line.rawCode) || "";
}

function cabinetIdFor(line: DistributorPoLineInput, catalog: IndexedDistributorCatalog): number | null {
  if (line.cabinetId != null && line.cabinetId > 0) return line.cabinetId;
  for (const code of [line.masterCode, line.rawCode, line.distributorSku]) {
    const id = catalog.cabinetIdByCode.get(normalizeCode(code ?? ""));
    if (id) return id;
  }
  return null;
}

function sameCabinet(rows: DistributorSkuRecord[]): DistributorSkuRecord[] | null {
  const ids = new Set(rows.map((row) => row.cabinetId ?? 0));
  if (ids.size > 1) return null;
  return rows;
}

function findSku(
  line: DistributorPoLineInput,
  distributorId: number,
  catalog: IndexedDistributorCatalog,
  cabinetId: number | null,
  styleId: number | null,
): DistributorSkuRecord | null {
  if (cabinetId != null && styleId != null) {
    const exact = catalog.skuByCabinetStyleDistributor.get(`${cabinetId}:${styleId}:${distributorId}`);
    if (exact) return exact;
  }
  if (cabinetId != null && styleId == null) {
    const rows = sameCabinet(catalog.skusByCabinetDistributor.get(`${cabinetId}:${distributorId}`) ?? []);
    if (rows?.length === 1) return rows[0];
  }
  const codes = [line.distributorSku, line.masterCode, line.rawCode].map((code) => normalizeCode(code ?? "")).filter(Boolean);
  const seen = new Set<string>();
  const matches: DistributorSkuRecord[] = [];
  for (const code of codes) {
    for (const row of catalog.skusByDistributorCode.get(`${distributorId}:${code}`) ?? []) {
      if (styleId != null && row.styleId !== styleId) continue;
      if (cabinetId != null && row.cabinetId != null && row.cabinetId !== cabinetId) continue;
      const key = `${row.cabinetId ?? 0}:${row.styleId}:${row.distributorSku}`;
      if (seen.has(key)) continue;
      seen.add(key);
      matches.push(row);
    }
  }
  const unique = sameCabinet(matches);
  if (!unique?.length) return null;
  return unique.slice().sort((a, b) => skuRank(b) - skuRank(a))[0] ?? null;
}

function findVendor(line: DistributorPoLineInput, distributorId: number, catalog: IndexedDistributorCatalog): VendorProductRecord | null {
  if (line.productKind !== "hardware") return null;
  if (line.vendorProductId != null && line.vendorProductId > 0) {
    const product = catalog.vendorById.get(line.vendorProductId);
    if (product && product.distributorId === distributorId) return product;
  }
  const codes = [line.distributorSku, line.masterCode, line.rawCode].map((code) => normalizeCode(code ?? "")).filter(Boolean);
  for (const code of codes) {
    const rows = catalog.vendorsByDistributorCode.get(`${distributorId}:${code}`) ?? [];
    if (rows.length === 1) return rows[0];
  }
  return null;
}

export function resolveDistributorPoLine(
  line: DistributorPoLineInput,
  distributorId: number,
  catalog: IndexedDistributorCatalog,
): DistributorPoLineView {
  const qty = Number.isFinite(line.qty) ? line.qty : 0;
  const unitPrice = line.unitPrice != null && Number.isFinite(line.unitPrice) ? line.unitPrice : null;
  const code = catalogCode(line);
  const style = line.styleId != null ? catalog.stylesById.get(line.styleId) : undefined;
  const doorStyle = doorStyleLabel(line, style);
  const unmapped = (sku: string): DistributorPoLineView => ({
    qty,
    sku: sku || "—",
    distributorItemName: NO_DISTRIBUTOR_SKU_MAPPED,
    supplierDescription: "",
    doorStyle,
    mapped: false,
    catalogCode: code,
    unitPrice,
  });

  const vendor = findVendor(line, distributorId, catalog);
  if (line.productKind === "hardware") {
    if (!vendor) return unmapped(code);
    const names = namesFrom(vendor.name, vendor.description);
    return {
      qty,
      sku: clean(vendor.vendorSku) || code || "—",
      distributorItemName: names.name,
      supplierDescription: names.description,
      doorStyle,
      mapped: true,
      catalogCode: code,
      unitPrice,
    };
  }

  const cabinetId = cabinetIdFor(line, catalog);
  const sku = findSku(line, distributorId, catalog, cabinetId, line.styleId ?? null);
  if (!sku) return unmapped(code);
  const names = namesFrom(sku.supplierCabinetName, sku.supplierDescription);
  return {
    qty,
    sku: clean(sku.distributorSku) || code || "—",
    distributorItemName: names.name,
    supplierDescription: names.description,
    doorStyle,
    mapped: true,
    catalogCode: code,
    unitPrice,
  };
}

/** Real supplier brand for a distributor-facing document. Never the white-label line name. */
export function distributorFacingName(distributor: { id: number; brandName?: string | null; code?: string | null }): string {
  const brand = clean(distributor.brandName);
  if (brand) return brand;
  const code = clean(distributor.code);
  if (code) return code;
  return `Distributor ${distributor.id}`;
}
