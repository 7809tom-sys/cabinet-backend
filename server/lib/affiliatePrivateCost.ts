export type AffiliatePrivateCostAccess = {
  isAdmin: boolean;
  requestedAffiliateSlug?: string;
  access?: {
    affiliateId: number | null;
    isOwner: boolean;
  } | null;
  requestedAffiliateId?: number | null;
};

/**
 * Private acquisition cost is visible to the master admin, or to the owning
 * affiliate only while the request is scoped to that affiliate's storefront.
 * Affiliate staff, direct-site views, and cross-affiliate storefronts remain
 * denied even when the user has other dashboard capabilities.
 */
export function canViewAffiliatePrivateCost({
  isAdmin,
  requestedAffiliateSlug,
  access,
  requestedAffiliateId,
}: AffiliatePrivateCostAccess): boolean {
  if (isAdmin) return true;
  return Boolean(
    requestedAffiliateSlug &&
      access?.isOwner &&
      access.affiliateId != null &&
      requestedAffiliateId != null &&
      access.affiliateId === requestedAffiliateId,
  );
}
