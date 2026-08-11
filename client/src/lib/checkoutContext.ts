export type CheckoutTier = "Contractor" | "Wholesale";

export function resolveCheckoutTier(initialTier: string | null | undefined, accountTier: string | null | undefined): CheckoutTier {
  if (initialTier === "Wholesale" || initialTier === "Contractor") return initialTier;
  return accountTier === "Wholesale" || accountTier === "wholesale" ? "Wholesale" : "Contractor";
}

export function checkoutUsesReadOnlyContext() {
  return { styleEditable: false, pricingEditable: false } as const;
}
