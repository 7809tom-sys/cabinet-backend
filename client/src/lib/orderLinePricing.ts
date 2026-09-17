import { isLockedDesignCheckoutPrice, resolveLockedCheckoutUnitPrice } from "@/lib/checkoutPriceLock";
import { isSurfaceCheckoutLine } from "@/lib/cartCheckoutPrefill";

export type CheckoutPriceLine = {
  matched: boolean;
  cabinetId: number | null;
  masterCode?: string | null;
  cartProductKind?: string | null;
  cartPriceLocked?: boolean;
  cartUnitPrice?: number | null;
};

export function checkoutUnitPriceForLine(
  line: CheckoutPriceLine,
  liveCabinetPrice: number | null,
): number | null {
  if (line.matched && line.cabinetId != null) {
    return resolveLockedCheckoutUnitPrice({
      priceLocked: isLockedDesignCheckoutPrice(line),
      storedUnitPrice: line.cartUnitPrice ?? null,
      recomputedUnitPrice: liveCabinetPrice,
    });
  }
  if (isSurfaceCheckoutLine(line) && isLockedDesignCheckoutPrice(line)) {
    return line.cartUnitPrice ?? null;
  }
  return null;
}

export function isCabinetFreightLine(line: CheckoutPriceLine): boolean {
  return !isSurfaceCheckoutLine(line)
    && line.matched
    && (line.cabinetId != null || Boolean(line.masterCode));
}
