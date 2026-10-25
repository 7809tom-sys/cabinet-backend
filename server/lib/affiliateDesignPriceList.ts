export type AffiliatePriceListAccess = {
  isAdmin: boolean;
  access: { affiliateId: number; isOwner: boolean } | null;
  requestedAffiliateId: number | null;
};

export function canViewAffiliateDesignPriceList(input: AffiliatePriceListAccess): boolean {
  return !input.isAdmin
    && input.access?.isOwner === true
    && input.requestedAffiliateId != null
    && input.access.affiliateId === input.requestedAffiliateId;
}

export function affiliateCustomerPosition(customerUnitPrice: number | null, affiliateUnitCost: number | null, quantity: number) {
  const qty = Math.max(0, Math.floor(quantity));
  if (customerUnitPrice == null || affiliateUnitCost == null || qty === 0) {
    return {
      customerLineTotal: null,
      affiliateLineTotal: null,
      positionDollars: null,
      positionPercent: null,
    };
  }
  const customerLineTotal = Math.round(customerUnitPrice * qty * 100) / 100;
  const affiliateLineTotal = Math.round(affiliateUnitCost * qty * 100) / 100;
  const positionDollars = Math.round((customerLineTotal - affiliateLineTotal) * 100) / 100;
  const positionPercent = customerLineTotal > 0
    ? Math.round((positionDollars / customerLineTotal) * 10000) / 100
    : null;
  return { customerLineTotal, affiliateLineTotal, positionDollars, positionPercent };
}
