import { normalizeCode } from "../shared/cabinetCodeMatch";

export interface VendorCabinetAliasRow {
  id: number;
  masterCode: string;
  sku?: string | null;
  vendorSku?: string | null;
  altSku1?: string | null;
  altSku2?: string | null;
  altSku3?: string | null;
}

export type VendorCabinetMatch =
  | { kind: "matched"; cabinetId: number; masterCode: string }
  | { kind: "not_found" }
  | { kind: "ambiguous" };

/** Resolve a vendor SKU to exactly one master cabinet alias; never guess. */
export function matchVendorCabinetBySku(
  distributorSku: string,
  rows: VendorCabinetAliasRow[],
): VendorCabinetMatch {
  const normalizedSku = normalizeCode(distributorSku);
  const matches = rows.filter((row) =>
    [row.masterCode, row.sku, row.vendorSku, row.altSku1, row.altSku2, row.altSku3]
      .filter((code): code is string => Boolean(code))
      .some((code) => normalizeCode(code) === normalizedSku),
  );

  if (matches.length === 0) return { kind: "not_found" };
  if (matches.length > 1) return { kind: "ambiguous" };
  return { kind: "matched", cabinetId: matches[0].id, masterCode: matches[0].masterCode };
}

export function hasVendorPrice(listPrice?: string | null, yourCost?: string | null): boolean {
  return Boolean(listPrice?.trim() || yourCost?.trim());
}
