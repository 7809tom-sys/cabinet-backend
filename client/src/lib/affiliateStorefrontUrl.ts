const PRODUCTION_ORIGIN = "https://www.cabinetdealz.com";

/**
 * The canonical public address for an affiliate storefront. The application
 * router renders every branded store at /store/:slug; subdomains are only an
 * optional server-side alias and must not be distributed as the primary link.
 */
export function affiliateStorefrontPath(slug: string): string {
  return `/store/${encodeURIComponent(slug.trim().toLowerCase())}`;
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
