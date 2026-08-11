const PRODUCTION_ORIGIN = "https://www.cabinetdealz.com";

/**
 * The canonical public address for an affiliate storefront. The application
 * router renders every branded store at /store/:slug; subdomains are only an
 * optional server-side alias and must not be distributed as the primary link.
 */
export function affiliateStorefrontPath(slug: string): string {
  return `/store/${encodeURIComponent(slug.trim().toLowerCase())}`;
}

/** The canonical administrative dashboard address for one affiliate record. */
export function affiliateDashboardPath(affiliateId: number): string {
  return `/affiliate?viewAs=${encodeURIComponent(String(affiliateId))}`;
}

/** Canonical public links rendered within the selected affiliate dashboard. */
export function affiliateDashboardLinks(
  affiliate: { slug: string; referralCode: string },
  origin?: string,
): { storefrontUrl: string; referralUrl: string } {
  const base = (origin || (typeof window !== "undefined" ? window.location.origin : PRODUCTION_ORIGIN)).replace(/\/+$/, "");
  return {
    storefrontUrl: `${base}${affiliateStorefrontPath(affiliate.slug)}`,
    referralUrl: `${base}/order/new?ref=${encodeURIComponent(affiliate.referralCode)}`,
  };
}

export function affiliateStorefrontUrl(slug: string, origin?: string): string {
  const base = (origin || (typeof window !== "undefined" ? window.location.origin : PRODUCTION_ORIGIN)).replace(/\/+$/, "");
  return `${base}${affiliateStorefrontPath(slug)}`;
}

export function copyAffiliateStorefrontLink(
  slug: string,
  options?: { origin?: string; clipboard?: Pick<Clipboard, "writeText"> }
): Promise<void> {
  const clipboard = options?.clipboard ?? navigator.clipboard;
  return clipboard.writeText(affiliateStorefrontUrl(slug, options?.origin));
}
