export function resolveLockedCheckoutUnitPrice({
  priceLocked,
  storedUnitPrice,
  recomputedUnitPrice,
}: {
  priceLocked?: boolean;
  storedUnitPrice: number | null;
  recomputedUnitPrice: number | null;
}): number | null {
  return priceLocked ? storedUnitPrice : recomputedUnitPrice ?? storedUnitPrice;
}

export function isLockedDesignCheckoutPrice(line: {
  cartPriceLocked?: boolean;
  cartUnitPrice?: number | null;
}): boolean {
  return line.cartPriceLocked === true && typeof line.cartUnitPrice === "number";
}
