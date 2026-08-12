export type CartPricingInput = {
  storedUnitPrice: number | null | undefined;
  liveUnitPrice: number | null | undefined;
  tier: string | null | undefined;
  isAffiliateCart: boolean;
};

/**
 * Select the price shown in the cart.
 *
 * Affiliate storefront items are stored with the exact marked-up homeowner
 * price shown on the storefront. The generic live cart endpoint only returns
 * platform tier prices, so it must not replace that stored value for an
 * affiliate homeowner item. Non-affiliate items continue to use the live
 * tier price when available.
 */
export function resolveAffiliateCartUnitPrice({
  storedUnitPrice,
  liveUnitPrice,
  tier,
  isAffiliateCart,
}: CartPricingInput): number | null {
  if (isAffiliateCart && tier === "homeowner" && storedUnitPrice != null) {
    return storedUnitPrice;
  }
  return liveUnitPrice ?? storedUnitPrice ?? null;
}

/** Calculate a line total without introducing floating-point display drift. */
export function calculateCartLineTotal(unitPrice: number | null, quantity: number): number | null {
  if (unitPrice == null || !Number.isFinite(unitPrice) || quantity <= 0) return null;
  return Number((unitPrice * quantity).toFixed(2));
}
