const PRODUCTION_ORIGIN = "https://www.cabinetdealz.com";
const AFFILIATE_DOMAIN_SUFFIX = ".cabinetdealz.com";

function affiliatePublicOrigin(slug: string, origin?: string): string {
  const base = (origin || (typeof window !== "undefined" ? window.location.origin : PRODUCTION_ORIGIN)).replace(/\/+$/, "");
  try {
    const hostname = new URL(base).hostname.toLowerCase();
    // Production dashboard links should distribute the affiliate's own domain,
    // not the central www URL plus an internal /store route. Preview hosts keep
    // the routed form because they do not own public affiliate subdomains.
    if (hostname === "www.cabinetdealz.com" || hostname === "cabinetdealz.com") {
      return `https://${encodeURIComponent(slug.trim().toLowerCase())}${AFFILIATE_DOMAIN_SUFFIX}`;
    }
  } catch {
    // Retain the safe routed fallback below for malformed development origins.
  }
  return base;
}

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
  const base = affiliatePublicOrigin(affiliate.slug, origin);
  const useDedicatedAffiliateDomain = base.endsWith(AFFILIATE_DOMAIN_SUFFIX);
  const storefrontPath = affiliateStorefrontPath(affiliate.slug);
  return {
    storefrontUrl: useDedicatedAffiliateDomain ? base : `${base}${storefrontPath}`,
    // A dedicated domain resolves its own /order path into the affiliate scope.
    // Preview/central origins require the explicit routed path to preserve it.
    referralUrl: useDedicatedAffiliateDomain
      ? `${base}/order?ref=${encodeURIComponent(affiliate.referralCode)}`
      : `${base}${storefrontPath}/order?ref=${encodeURIComponent(affiliate.referralCode)}`,
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
