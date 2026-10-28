import { inArray, or } from "drizzle-orm";
import { cabinets } from "../../drizzle/schema";
import { getDb } from "../db";
import { isMissingFreeShippingColumn } from "./cabinetFreeShippingSchema";
import {
  catalogFreeShippingIndexFromRows,
  EMPTY_CATALOG_FREE_SHIPPING_INDEX,
  isCatalogFreeShippingIdentity,
  type CatalogFreeShippingIndex,
  type CatalogFreightIdentity,
} from "@shared/freeShippingItem";

export { isCatalogFreeShippingIdentity, EMPTY_CATALOG_FREE_SHIPPING_INDEX };
export type { CatalogFreeShippingIndex, CatalogFreightIdentity };

/**
 * Reads cabinets.freeShipping for the cabinet ids and master codes on an order
 * or freight request. The client flag is never the source of truth.
 */
export async function loadCatalogFreeShippingIndex(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  items: CatalogFreightIdentity[],
): Promise<CatalogFreeShippingIndex> {
  const ids = Array.from(new Set(
    items
      .map((item) => item.cabinetId)
      .filter((id): id is number => typeof id === "number" && id > 0),
  ));
  const codes = Array.from(new Set(
    items
      .map((item) => (item.masterCode ?? item.rawCode ?? "").trim().toUpperCase())
      .filter((code) => code.length > 0),
  ));
  if (ids.length === 0 && codes.length === 0) return EMPTY_CATALOG_FREE_SHIPPING_INDEX;

  try {
    const rows = await db
      .select({
        id: cabinets.id,
        masterCode: cabinets.masterCode,
        freeShipping: cabinets.freeShipping,
      })
      .from(cabinets)
      .where(
        ids.length > 0 && codes.length > 0
          ? or(inArray(cabinets.id, ids), inArray(cabinets.masterCode, codes))
          : ids.length > 0
            ? inArray(cabinets.id, ids)
            : inArray(cabinets.masterCode, codes),
      );
    return catalogFreeShippingIndexFromRows(rows);
  } catch (error) {
    if (isMissingFreeShippingColumn(error)) return EMPTY_CATALOG_FREE_SHIPPING_INDEX;
    throw error;
  }
}
