import type { FreightQuoteTokenItem } from "../_core/freightQuoteToken";
import { isTemporaryOneDollarCheckoutTestItem } from "@shared/temporaryCheckoutTest";

/**
 * The exact cabinet identity committed into a shipping-quote token.
 *
 * Cabinet, Pelican surface, and Hardware Resources lines are all part of the signed quote identity.
 * The freight router keeps their vendor shipment groups separate; free-text
 * checkout lines still have no freight identity and are excluded.
 */
export type FreightQuoteOrderLine = {
  cabinetId: number | null;
  masterCode?: string | null;
  styleId?: number | null;
  distributorId?: number | null;
  productKind?: "surface" | "hardware" | "sample" | null;
  pelicanProductId?: number | null;
  vendorProductId?: number | null;
  qty: number;
};

export function freightQuoteItemsForOrder(lines: FreightQuoteOrderLine[]): FreightQuoteTokenItem[] {
  return lines
    .filter((line) => line.productKind === "hardware"
      ? line.vendorProductId != null
      : line.cabinetId != null || Boolean(line.masterCode?.trim()))
    .filter((line) => !isTemporaryOneDollarCheckoutTestItem(line))
    .map((line) => line.productKind === "hardware"
      ? { vendorProductId: line.vendorProductId!, qty: line.qty }
      : {
          cabinetId: line.cabinetId,
          masterCode: line.masterCode ?? null,
          styleId: line.styleId ?? null,
          distributorId: line.distributorId ?? null,
          ...(line.pelicanProductId != null ? { pelicanProductId: line.pelicanProductId } : {}),
          qty: line.qty,
        });
}
